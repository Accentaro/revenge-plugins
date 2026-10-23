import { ActionSheetActionCreators } from '@revenge-mod/discord/actions'
import { Design } from '@revenge-mod/discord/design'
import { Stores } from '@revenge-mod/discord/flux'
import { after, before, instead } from '@revenge-mod/patcher'
import { afterJSX } from '@revenge-mod/react/jsx-runtime'
import {
	Component,
	cloneElement,
	createContext,
	isValidElement,
	useContext,
} from 'react'
import SheetEditor from './SheetEditor'
import {
	componentName,
	createChannelSurface,
	createMessageSurface,
} from './surfaces'
import type { PluginApi } from '@revenge-mod/plugins/types'
import type { ReactNode } from 'react'
import type { Settings } from './Settings'
import type { SheetElement } from './SheetEditor'
import type { SurfaceDefinition } from './surfaces'

type Api = PluginApi<{ jsonStorage: Settings }>
const sheetKey = 'MessageLongPressActionSheet'

export function registerMessageSheet(api: Api) {
	const channelStore = Stores.ChannelStore as typeof Stores.ChannelStore & {
		getChannel(id: string): { guild_id?: string } | undefined
	}
	const messageSurface = createMessageSurface()
	const channelSurface = createChannelSurface('channel')
	const dmSurface = createChannelSurface('dm')
	const ChannelSurfaceContext = createContext<SurfaceDefinition | undefined>(
		undefined,
	)
	class EditorBoundary extends Component<
		{
			sheet: SheetElement
			api: Api
			surface?: SurfaceDefinition
		},
		{ failed: boolean }
	> {
		state = { failed: false }
		static getDerivedStateFromError() {
			return { failed: true }
		}
		componentDidCatch(error: Error) {
			this.props.api.plugin.reportError(error)
		}
		render() {
			return this.state.failed ? (
				this.props.sheet
			) : (
				<SheetEditor
					{...this.props}
					surface={this.props.surface ?? messageSurface}
				/>
			)
		}
	}

	function ChannelSheet({ sheet }: { sheet: SheetElement }) {
		const surface = useContext(ChannelSurfaceContext)
		return surface ? (
			<EditorBoundary sheet={sheet} api={api} surface={surface} />
		) : (
			sheet
		)
	}
	api.cleanup(
		afterJSX(Design.ActionSheet, sheet => {
			// Channel sheets render inside a connected component; message sheets retain their existing hook.
			const header = sheet.props.header
			return isValidElement(header) &&
				componentName(header.type) === 'ActionSheetIconHeader' ? (
				<ChannelSheet sheet={sheet} />
			) : (
				sheet
			)
		}),
	)

	let active = true
	let opened: string | undefined
	const patched = new WeakSet<object>()
	let reportedLayout = false
	function wrapSheet(tree: ReactNode): ReactNode {
		if (Array.isArray(tree)) {
			const children = tree.map(wrapSheet)
			return children.every((child, index) => child === tree[index])
				? tree
				: children
		}
		if (!isValidElement<{ children?: ReactNode }>(tree)) return tree
		if (tree.type === Design.ActionSheet) {
			opened = sheetKey
			return (
				<EditorBoundary key={tree.key} sheet={tree as SheetElement} api={api} />
			)
		}
		if (tree.props.children === undefined) return tree
		const children = wrapSheet(tree.props.children)
		return children === tree.props.children
			? tree
			: cloneElement(tree, { children })
	}

	api.cleanup(() => {
		active = false
		if (opened) ActionSheetActionCreators.hideActionSheet(opened)
	})
	api.cleanup(
		before(ActionSheetActionCreators, 'openLazy', args => {
			const [pending, key] = args
			const channelSheet = key.startsWith('ChannelLongPress-')
			if (key !== sheetKey && !channelSheet) return args
			if (channelSheet) opened = key
			pending
				.then(namespace => {
					// Promise callbacks can outlive plugin cleanup.
					if (!active || patched.has(namespace)) return
					if (
						typeof namespace.default !== 'function' ||
						namespace.default.prototype?.isReactComponent
					)
						throw new Error(
							'Action sheet component changed; customisation was skipped',
						)
					const owner = namespace as {
						default(props: { channelId?: string }): ReactNode
					}
					if (channelSheet) {
						api.cleanup(
							instead(owner, 'default', function (args, original) {
								const tree = Reflect.apply(original, this, args)
								const channelId = args[0].channelId
								const channel = channelId
									? channelStore.getChannel(channelId)
									: undefined
								if (!active || !channel) return tree
								return (
									<ChannelSurfaceContext.Provider
										value={channel.guild_id ? channelSurface : dmSurface}
									>
										{tree}
									</ChannelSurfaceContext.Provider>
								)
							}),
						)
						patched.add(namespace)
						return
					}
					api.cleanup(
						after(owner, 'default', tree => {
							if (!active) return tree
							// React children may be a single element, an array or nested wrappers.
							const result = wrapSheet(tree)
							if (result === tree && tree != null && !reportedLayout) {
								reportedLayout = true
								api.plugin.reportError(
									'Message sheet layout was not recognized; customisation was skipped.',
								)
							}
							return result
						}),
					)
					patched.add(namespace)
				})
				.catch(error => api.plugin.reportError(error))
			return args
		}),
	)
}

/** @jsxImportSource . */
import { ToastActionCreators } from '@revenge-mod/discord/actions'
import {
	getModuleWithImportedPath,
	lookupModuleWithImportedPath,
} from '@revenge-mod/discord/utils/modules/finders'
import { getModules, lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { after } from '@revenge-mod/patcher'
import React from 'react'
import * as Native from 'react-native'
import { computeGuildDockSpecs } from './data'
import SettingsComponent, { DefaultSettings } from './settings'
import { createServerDrawer, DOCK_REST_OFFSET } from './surface'
import type * as t from './types'

type NativeComponent = (props: Record<string, unknown>) => React.ReactNode

interface HomeDrawerConfig {
	enableHome: boolean
	landOnHome: boolean
	enablePeekHint: boolean
}

let reportError: (error: unknown) => void

export default plugin<{ jsonStorage: t.ServerDrawerPreferences }>({
	jsonStorage: { load: true, default: DefaultSettings },
	SettingsComponent,
	stop({ plugin }) {
		plugin.requireReload()
	},
	start({ cleanup, jsonStorage, plugin }) {
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}
		reportError = error => plugin.reportError(error)
		const abort = new AbortController()
		cleanup(() => abort.abort())
		cleanup(
			getModules(
				withProps<{
					getICYMIEnabled(): boolean
					useICYMIEnabled(): boolean
				}>('getICYMIEnabled', 'useICYMIEnabled'),
				module => {
					// Keep native hooks running; override only the feature-gate result.
					cleanup(after(module, 'getICYMIEnabled', () => false))
					cleanup(after(module, 'useICYMIEnabled', () => false))
				},
			),
		)
		cleanup(
			getModules(
				withProps<{
					MobileHomeDrawerExperiment: {
						getConfig(): HomeDrawerConfig
						useConfig(): HomeDrawerConfig
					}
				}>('MobileHomeDrawerExperiment'),
				({ MobileHomeDrawerExperiment }) => {
					for (const key of ['getConfig', 'useConfig'] as const)
						cleanup(
							after(MobileHomeDrawerExperiment, key, config => ({
								...config,
								enableHome: false,
								landOnHome: false,
								enablePeekHint: false,
							})),
						)
				},
			),
		)

		const useActive = () =>
			React.useSyncExternalStore(
				listener => {
					abort.signal.addEventListener('abort', listener)
					return () => abort.signal.removeEventListener('abort', listener)
				},
				() => !abort.signal.aborted,
			)

		cleanup(
			getModuleWithImportedPath<{
				default: {
					type: NativeComponent
				}
			}>('components_native/MainChannels.tsx', module => {
				if (abort.signal.aborted) return
				let Panel: React.ComponentType<{ element: t.NativePanel }> | undefined
				let failed = false
				const initialize = (element: React.ReactNode) => {
					if (failed || abort.signal.aborted) return element
					if (!isNativePanel(element)) {
						failed = true
						plugin.reportError(
							new Error('Server Drawer: unsupported left-panel content.'),
						)
						return element
					}
					if (Panel) return <Panel key={element.key} element={element} />
					try {
						const [inset] = lookupModule(
							withProps<{ useYouBarTotalHeight(): number }>(
								'useYouBarTotalHeight',
							),
						)
						const [shade] = lookupModuleWithImportedPath<{
							default: { type: () => t.PanelElement }
						}>('modules/main_tabs_v2/native/you_bar/YouBarFloatingShade.tsx')
						const [channelWidth] = lookupModuleWithImportedPath<{
							default: () => number
						}>('modules/channel_list_v2/native/useChannelListWidth.tsx')
						const [chatLayout] = lookupModule(
							withProps<{
								getChatLayout(): { isChatBesideChannelList: boolean }
							}>('getChatLayout'),
						)
						const [constants] = lookupModule(
							withProps<{ DM_WIDTH: number }>('DM_WIDTH'),
						)
						if (
							!inset ||
							typeof shade?.default?.type !== 'function' ||
							typeof channelWidth?.default !== 'function' ||
							!chatLayout ||
							!constants ||
							typeof module.default?.type !== 'function'
						) {
							throw new Error(
								'Server Drawer: this Discord version has an unsupported home panel.',
							)
						}
						const DrawerSurface = createServerDrawer(jsonStorage, abort.signal)
						const useInset = () => {
							const height = inset.useYouBarTotalHeight()
							return Math.max(0, Number.isFinite(height) ? height : 0)
						}
						function YouBarBackdrop({ element }: t.ElementProps) {
							const height = useInset()
							const active = useActive()
							return active && Native.Platform.OS !== 'ios' ? (
								<Native.View
									pointerEvents="none"
									style={{
										position: 'absolute',
										bottom: 0,
										left: 0,
										right: 0,
										height,
										overflow: 'hidden',
									}}
								>
									{element}
								</Native.View>
							) : (
								element
							)
						}
						function ServerDrawerLeftPanel({
							element,
						}: {
							element: t.NativePanel
						}) {
							const active = useActive()
							const bottomInset = useInset()
							const [width, setWidth] = React.useState(
								() => Native.Dimensions.get('window').width,
							)
							return active
								? transformLeftPanelContent(
										element,
										<DrawerSurface
											key="server-drawer"
											bottomInset={bottomInset}
											onWidthChange={setWidth}
										/>,
										computeGuildDockSpecs(width - 16).dockHeight -
											DOCK_REST_OFFSET,
									)
								: element
						}
						cleanup(
							after(shade.default, 'type', element => (
								<YouBarBackdrop element={element} />
							)),
						)
						cleanup(
							after(channelWidth, 'default', width =>
								chatLayout.getChatLayout().isChatBesideChannelList
									? width
									: width + constants.DM_WIDTH,
							),
						)
						Panel = ServerDrawerLeftPanel
						return <Panel key={element.key} element={element} />
					} catch (error) {
						failed = true
						plugin.reportError(error)
						return element
					}
				}
				const wrappers = new Map<
					React.ReactElement['type'],
					React.ElementType
				>()
				const wrapPanel = (node: React.ReactNode): React.ReactNode => {
					if (Array.isArray(node)) {
						const children = node.map(wrapPanel)
						return children.every((child, index) => child === node[index])
							? node
							: children
					}
					if (!React.isValidElement<{ children?: React.ReactNode }>(node))
						return node
					const type = node.type
					const memo =
						typeof type === 'object' && type !== null && 'type' in type
							? (type as React.MemoExoticComponent<NativeComponent> & {
									compare?: (
										a: Record<string, unknown>,
										b: Record<string, unknown>,
									) => boolean
								})
							: undefined
					const original = memo?.type ?? type
					// The bottom drawer replaces the native horizontal home-drawer gesture.
					if (
						typeof original === 'function' &&
						original.name === 'NonCollapsableGestureDetector'
					)
						return wrapPanel(node.props.children)
					if (
						typeof original === 'function' &&
						(original.name === 'LeftMenuTabsInner' ||
							original.name === 'LeftPanelHomeDrawerContainer' ||
							original.name === 'LeftPanelContent')
					) {
						let Wrapper = wrappers.get(type)
						if (!Wrapper) {
							const render = original as NativeComponent
							// Keep each native component's hooks and identity stable across renders and disable.
							const Component =
								original.name === 'LeftPanelContent'
									? function ServerDrawerLeftPanelContent(
											props: Record<string, unknown>,
										) {
											const active = useActive()
											const rendered = render(
												active && 'panelStyles' in props
													? { ...props, panelStyles: undefined }
													: props,
											)
											const [ready, setReady] = React.useState(false)
											// The You bar initializes its shade during the first child render.
											React.useEffect(() => {
												setReady(true)
											}, [])
											return ready ? initialize(rendered) : rendered
										}
									: function ServerDrawerPanelContainer(
											props: Record<string, unknown>,
										) {
											const active = useActive()
											const rendered = render(props)
											return active ? wrapPanel(rendered) : rendered
										}
							Wrapper = memo ? React.memo(Component, memo.compare) : Component
							wrappers.set(type, Wrapper)
						}
						return <Wrapper key={node.key} {...node.props} />
					}
					const children = wrapPanel(node.props.children)
					return children === node.props.children
						? node
						: React.cloneElement(node, { children })
				}
				cleanup(after(module.default, 'type', wrapPanel))
			}),
		)
	},
})

export function reportActionFailure(operation: string, error: unknown): void {
	reportError(error)
	ToastActionCreators.open('SERVER_DRAWER_ACTION_ERROR', {
		text: `Could not ${operation}. Please try again.`,
		variant: 'critical',
	})
}

// Reserve only the dock: native channel screens already account for the You bar.
export function transformLeftPanelContent(
	rendered: t.NativePanel,
	dock: React.ReactNode,
	dockHeight: number,
) {
	const [rail, content] = rendered.props.children
	return React.cloneElement(rendered, {
		children: [
			<Native.View
				key="rail"
				accessibilityElementsHidden
				importantForAccessibility="no-hide-descendants"
				pointerEvents="none"
				style={{
					height: 1,
					width: 1,
					position: 'absolute',
					left: -10000,
					opacity: 0,
				}}
			>
				{rail}
			</Native.View>,
			React.cloneElement(content, {
				style: [
					content.props.style,
					{
						bottom: dockHeight,
						left: 0,
						right: 0,
						width: '100%',
						borderLeftWidth: 0,
					},
				],
			}),
			dock,
		],
	})
}

function isNativePanel(element: React.ReactNode): element is t.NativePanel {
	return (
		React.isValidElement<{ children?: React.ReactNode }>(element) &&
		Array.isArray(element.props.children) &&
		element.props.children.length === 2 &&
		React.isValidElement(element.props.children[1])
	)
}

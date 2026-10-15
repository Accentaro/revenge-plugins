/** @jsxImportSource . */
import { ToastActionCreators } from '@revenge-mod/discord/actions'
import { lookupModuleWithImportedPath } from '@revenge-mod/discord/utils/modules/finders'
import { lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { after } from '@revenge-mod/patcher'
import { ReactJSXRuntime } from '@revenge-mod/react'
import React from 'react'
import * as Native from 'react-native'
import { computeGuildDockSpecs } from './data'
import SettingsComponent, { DefaultSettings } from './settings'
import { createServerDrawer, DOCK_REST_OFFSET } from './surface'
import type * as t from './types'

let reportError: (error: unknown) => void

export default plugin<{ jsonStorage: t.ServerDrawerPreferences }>({
	jsonStorage: { load: true, default: DefaultSettings },
	SettingsComponent,
	start({ cleanup, jsonStorage, plugin }) {
		reportError = error => plugin.reportError(error)
		const abort = new AbortController()
		cleanup(() => abort.abort())
		if (plugin.startedLate) plugin.requireReload()

		const useActive = () =>
			React.useSyncExternalStore(
				listener => {
					abort.signal.addEventListener('abort', listener)
					return () => abort.signal.removeEventListener('abort', listener)
				},
				() => !abort.signal.aborted,
			)

		let Panel: React.ComponentType<{ element: t.NativePanel }> | undefined
		let failed = false
		const initialize = (element: t.NativePanel) => {
			if (failed || abort.signal.aborted) return element
			if (
				!React.isValidElement(element) ||
				!Array.isArray(element.props.children) ||
				!React.isValidElement(element.props.children[1])
			)
				return element
			if (Panel) return <Panel key={element.key} element={element} />
			try {
				const [inset] = lookupModule(
					withProps<{ useYouBarTotalHeight(): number }>('useYouBarTotalHeight'),
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
					!constants
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
								computeGuildDockSpecs(width - 16).dockHeight - DOCK_REST_OFFSET,
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
		function ServerDrawerPanel({
			element,
		}: {
			element: React.ReactElement<Record<string, unknown>, t.PanelComponent>
		}) {
			// Keep the native component's hooks mounted when the plugin is disabled.
			const rendered = element.type(element.props)
			const active = useActive()
			const [ready, setReady] = React.useState(false)
			// The You bar initializes its shade during the first child render.
			React.useEffect(() => {
				setReady(true)
			}, [])
			return active && ready ? initialize(rendered) : rendered
		}
		// LeftPanelContent is private. Target its JSX identity, independent of parent wrappers.
		for (const key of ['jsx', 'jsxs'] as const) {
			cleanup(
				after(ReactJSXRuntime, key, element => {
					if (
						typeof element?.type !== 'function' ||
						element.type.name !== 'LeftPanelContent'
					)
						return element
					return (
						<ServerDrawerPanel
							key={element.key}
							element={
								element as React.ReactElement<
									Record<string, unknown>,
									t.PanelComponent
								>
							}
						/>
					)
				}),
			)
		}
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

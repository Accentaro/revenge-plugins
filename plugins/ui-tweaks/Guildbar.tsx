import { Stores } from '@revenge-mod/discord/flux'
import { getModuleWithImportedPath } from '@revenge-mod/discord/utils/modules/finders'
import { getModules, lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { after, instead } from '@revenge-mod/patcher'
import { ReactJSXRuntime } from '@revenge-mod/react'
import { afterJSX } from '@revenge-mod/react/jsx-runtime'
import {
	cloneElement,
	createContext,
	isValidElement,
	use,
	useEffect,
	useMemo,
	useSyncExternalStore,
} from 'react'
import { Animated, Platform, View } from 'react-native'
import { barHapticFeedback } from './PullHandle'
import { defaults } from './Settings'
import type { PluginApi } from '@revenge-mod/plugins/types'
import type {
	ComponentType,
	Context,
	FunctionComponent,
	ReactElement,
	ReactNode,
} from 'react'
import type { ViewProps } from 'react-native'
import type { BarSpring, GestureLibrary, PanGesture } from './PullHandle'
import type { Settings } from './Settings'

type Tree = ReactElement<ViewProps>
interface PanelContext {
	gesture: unknown
	disallowGesture: { set(value: boolean): void }
}
interface HorizontalPan extends PanGesture {
	activeOffsetX(value: number): this
	failOffsetY(value: [number, number]): this
}

let drawerActive = false
export const isServerDrawerActive = () => drawerActive

export function registerGuildbar({
	cleanup,
	jsonStorage,
	plugin,
}: PluginApi<{ jsonStorage: Settings }>) {
	// Width hooks must be installed before their first render.
	if (plugin.startedLate)
		return () => {
			drawerActive = true
		}
	const Collapsed = createContext(0)
	let active = true
	let collapsed = false
	let progress = 0
	const animation = new Animated.Value(0)
	const listeners = new Set<() => void>()
	const notify = () => listeners.forEach(listener => listener())
	const subscribe = (listener: () => void) => {
		listeners.add(listener)
		return () => {
			listeners.delete(listener)
		}
	}
	const setCollapsed = (value: boolean, feedback = false) => {
		const next = active && !drawerActive && value
		if (collapsed === next && feedback) return
		if (feedback && collapsed !== next) barHapticFeedback()
		collapsed = next
		notify()
		animation.stopAnimation()
		const [native] = lookupModule(
			withProps<BarSpring>('YOU_BAR_SPRING_CONFIG'),
			{ initialize: false },
		)
		const reducedMotion =
			'useReducedMotion' in Stores.AccessibilityStore &&
			Stores.AccessibilityStore.useReducedMotion === true
		if (!feedback || reducedMotion || !native) animation.setValue(Number(next))
		else
			Animated.spring(animation, {
				...native.YOU_BAR_SPRING_CONFIG,
				mass: native.YOU_BAR_SPRING_CONFIG.mass * 1.44,
				damping: native.YOU_BAR_SPRING_CONFIG.damping * 0.9,
				overshootClamping: false,
				toValue: Number(next),
				useNativeDriver: false,
			}).start()
	}
	const animationListener = animation.addListener(({ value }) => {
		progress = value
		notify()
	})
	function useHidden() {
		const enabled =
			jsonStorage.use()?.collapsibleGuildbar ?? defaults.collapsibleGuildbar
		return useSyncExternalStore(
			subscribe,
			() => active && enabled && !drawerActive && collapsed,
		)
	}
	const railWidth = () =>
		lookupModule(withProps<{ DM_WIDTH: number }>('DM_WIDTH'), {
			initialize: false,
		})[0]?.DM_WIDTH
	cleanup(() => {
		active = false
		animation.stopAnimation()
		animation.removeListener(animationListener)
		progress = 0
		collapsed = false
		drawerActive = false
		notify()
	})
	cleanup(
		getModuleWithImportedPath<{ default(): number }>(
			'modules/channel_list_v2/native/useChannelListWidth.tsx',
			module =>
				cleanup(
					after(module, 'default', width => {
						const progress = use(Collapsed)
						return width + progress * (railWidth() ?? 0)
					}),
				),
		),
	)
	interface BackgroundProps {
		offsetX?: number
		offsetY?: number
	}
	function Background({
		Original,
		props,
	}: {
		Original: ComponentType<BackgroundProps>
		props: BackgroundProps
	}) {
		const progress = use(Collapsed)
		return (
			<Original
				{...props}
				offsetX={
					typeof props.offsetX === 'number' && props.offsetX === railWidth()
						? props.offsetX * (1 - progress)
						: props.offsetX
				}
			/>
		)
	}
	cleanup(
		getModules(
			withProps<{
				ScreenAlignedThemedGradientSliding: unknown
				default: FunctionComponent<BackgroundProps>
			}>('ScreenAlignedThemedGradientSliding'),
			module => {
				cleanup(
					instead(module, 'default', ([props], Original) => (
						<Background Original={Original} props={props} />
					)),
				)
			},
		),
	)

	function Guildbar({
		children: element,
	}: {
		children: ReactElement<
			Record<string, unknown>,
			(props: Record<string, unknown>) => Tree
		>
	}) {
		return <GuildbarLayout tree={element.type(element.props)} />
	}
	function GuildbarLayout({ tree }: { tree: Tree }) {
		const hidden = useHidden()
		const position = useSyncExternalStore(subscribe, () => progress)
		const enabled =
			jsonStorage.use()?.collapsibleGuildbar ?? defaults.collapsibleGuildbar
		const running = useSyncExternalStore(
			subscribe,
			() => active && !drawerActive,
		)
		const [context] = lookupModule(
			withProps<{
				default: Context<PanelContext | undefined>
				MainTabsChannelScreenStackContext: unknown
			}>('MainTabsChannelScreenStackContext'),
			{ initialize: false },
		)
		const [library] = lookupModule(
			withProps<
				GestureLibrary & {
					Gesture: GestureLibrary['Gesture'] & { Pan(): HorizontalPan }
				}
			>('Gesture', 'GestureDetector'),
			{ initialize: false },
		)
		const [configs] = lookupModule(
			withProps<{
				ANDROID_PANELS_ANIMATION_CONFIG: { touchSlopForPanGesture: number }
				DEFAULT_PANELS_ANIMATION_CONFIG: { touchSlopForPanGesture: number }
			}>('ANDROID_PANELS_ANIMATION_CONFIG', 'DEFAULT_PANELS_ANIMATION_CONFIG'),
			{ initialize: false },
		)
		const panel = context && use(context.default)
		const slop = (
			Platform.OS === 'android'
				? configs?.ANDROID_PANELS_ANIMATION_CONFIG
				: configs?.DEFAULT_PANELS_ANIMATION_CONFIG
		)?.touchSlopForPanGesture
		const width = railWidth()
		const gestures = useMemo(() => {
			if (!library || !panel || slop === undefined) return
			return [true, false].map(hide =>
				(library.Gesture.Pan() as HorizontalPan)
					.activeOffsetX(hide ? -slop : slop)
					.failOffsetY([-slop, slop])
					.maxPointers(1)
					.simultaneousWithExternalGesture(panel.gesture)
					.runOnJS(true)
					.onBegin(() => panel.disallowGesture.set(true))
					.onEnd((_event, success) => {
						if (success) setCollapsed(hide, true)
					})
					.onFinalize(() => panel.disallowGesture.set(false)),
			)
		}, [library, panel, slop])
		useEffect(() => {
			if (!enabled || !running) setCollapsed(false)
		}, [enabled, running])
		useEffect(() => () => panel?.disallowGesture.set(false), [panel])
		if (!running || !enabled || !library || !gestures || width === undefined)
			return tree
		const children = tree.props.children
		if (
			!Array.isArray(children) ||
			children.length !== 2 ||
			!isValidElement<ViewProps>(children[1])
		)
			return tree
		const [rail, content] = children
		const area = (
			child: ReactNode,
			hide: boolean,
			style: ViewProps['style'],
		) => (
			<library.GestureHandlerRootView
				key={hide ? 'guildbar' : 'channels'}
				unstable_forceActive
				style={style}
			>
				<library.GestureDetector
					gesture={gestures[hide ? 0 : 1].enabled(hide ? !hidden : hidden)}
				>
					<View
						collapsable={false}
						style={{ flex: 1 }}
						accessibilityElementsHidden={hide && hidden}
						importantForAccessibility={
							hide && hidden ? 'no-hide-descendants' : 'auto'
						}
					>
						{child}
					</View>
				</library.GestureDetector>
			</library.GestureHandlerRootView>
		)
		return (
			<Collapsed value={position}>
				{cloneElement(
					tree,
					{},
					area(rail, true, {
						position: 'absolute',
						left: -width * position,
						top: 0,
						bottom: 0,
						width,
					}),
					cloneElement(
						content,
						{
							style: [
								content.props.style,
								{
									left: width * (1 - position),
									...(hidden && { borderLeftWidth: 0 }),
								},
							],
						},
						area(content.props.children, false, { flex: 1 }),
					),
				)}
			</Collapsed>
		)
	}
	const discovery: (() => unknown)[] = []
	let found = false
	const discover = (element: ReactElement<unknown>) => {
		if (
			!found &&
			typeof element?.type === 'function' &&
			element.type.name === 'LeftPanelContent'
		) {
			found = true
			const wrap = (tree: Parameters<typeof Guildbar>[0]['children']) => (
				<Guildbar>{tree}</Guildbar>
			)
			const target = element as Parameters<typeof Guildbar>[0]['children']
			cleanup(afterJSX(target.type, wrap))
			discovery.splice(0).forEach(unpatch => unpatch())
			return wrap(target)
		}
		return element
	}
	for (const key of ['jsx', 'jsxs'] as const)
		discovery.push(after(ReactJSXRuntime, key, discover))
	cleanup(() => discovery.splice(0).forEach(unpatch => unpatch()))
	return () => {
		drawerActive = true
		queueMicrotask(() => setCollapsed(false))
	}
}

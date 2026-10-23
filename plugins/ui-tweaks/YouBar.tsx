import { Tokens } from '@revenge-mod/discord/common/tokens'
import { Design } from '@revenge-mod/discord/design'
import { Stores } from '@revenge-mod/discord/flux'
import { getModuleWithImportedPath } from '@revenge-mod/discord/utils/modules/finders'
import { getModules, lookupModule } from '@revenge-mod/modules/finders'
import {
	createFilterGenerator,
	withProps,
} from '@revenge-mod/modules/finders/filters'
import { after, instead } from '@revenge-mod/patcher'
import { ReactJSXRuntime } from '@revenge-mod/react'
import { afterJSX } from '@revenge-mod/react/jsx-runtime'
import { lookupGeneratedIconComponent } from '@revenge-mod/utils/discord'
import {
	Children,
	cloneElement,
	createContext,
	isValidElement,
	use,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from 'react'
import {
	Animated,
	Dimensions,
	PixelRatio,
	Platform,
	useWindowDimensions,
	View,
} from 'react-native'
import { barHapticFeedback, HANDLE_SIZE, usePullHandle } from './PullHandle'
import { defaults } from './Settings'
import type { PluginApi } from '@revenge-mod/plugins/types'
import type { ComponentType, ReactElement, ReactNode } from 'react'
import type { GestureResponderEvent, ViewProps } from 'react-native'
import type { GestureLibrary } from './PullHandle'
import type { Settings } from './Settings'

type Tree = ReactElement<{ children?: ReactNode }>
interface DrawerProps {
	bottomInset: number
	onWidthChange(width: number): void
}
interface Insets {
	bottom: number
}
interface SafeArea {
	default: unknown
	getSafeAreaInsets(): Insets
}
interface PanelConfig {
	touchSlopForPanGesture: number
}
interface BarConstants {
	YOU_BAR_HEIGHT: number
	YOU_BAR_PADDING: number
	YOU_BAR_SPRING_CONFIG: {
		mass: number
		stiffness: number
		damping: number
		overshootClamping: boolean
	}
}

export function registerYouBar(
	{ cleanup, jsonStorage, plugin }: PluginApi<{ jsonStorage: Settings }>,
	onDrawer: () => void,
) {
	const useStyles = Design.createStyles({
		handle: { backgroundColor: Tokens.default.colors.BACKGROUND_SURFACE_HIGH },
	})
	let active = true
	let collapsed = false
	let progress = 0
	let fullWidthList = false
	let drawerGestures = 0
	const Drawer = createContext(false)
	const Inset = createContext(0)
	const AnimatedView = Animated.View
	const animation = new Animated.Value(0)
	const listeners = new Set<() => void>()
	const notify = () => listeners.forEach(listener => listener())
	const subscribe = (listener: () => void) => {
		listeners.add(listener)
		return () => {
			listeners.delete(listener)
		}
	}
	const safeArea = () =>
		lookupModule(withProps<SafeArea>('getSafeAreaInsets', 'default'), {
			initialize: false,
		})[0]
	const constants = () =>
		lookupModule(
			withProps<BarConstants>('YOU_BAR_HEIGHT', 'YOU_BAR_SPRING_CONFIG'),
			{ initialize: false },
		)[0]
	const distance = () => {
		const native = constants()
		return native ? native.YOU_BAR_HEIGHT - native.YOU_BAR_PADDING : 0
	}
	const panelConfig = () => {
		const [panels] = lookupModule(
			withProps<{
				ANDROID_PANELS_ANIMATION_CONFIG: PanelConfig
				DEFAULT_PANELS_ANIMATION_CONFIG: PanelConfig
			}>('ANDROID_PANELS_ANIMATION_CONFIG', 'DEFAULT_PANELS_ANIMATION_CONFIG'),
			{ initialize: false },
		)
		return Platform.OS === 'android'
			? panels?.ANDROID_PANELS_ANIMATION_CONFIG
			: panels?.DEFAULT_PANELS_ANIMATION_CONFIG
	}
	function settle(next: boolean, velocity?: number) {
		if (!active) return
		const native = constants()
		if (!native) {
			plugin.reportError('The You bar animation is unavailable.')
			return
		}
		const reducedMotion =
			'useReducedMotion' in Stores.AccessibilityStore &&
			Stores.AccessibilityStore.useReducedMotion === true
		if (collapsed !== next) barHapticFeedback()
		collapsed = next
		notify()
		animation.stopAnimation()
		if (reducedMotion) animation.setValue(next ? 1 : 0)
		else
			Animated.spring(animation, {
				...native.YOU_BAR_SPRING_CONFIG,
				mass: native.YOU_BAR_SPRING_CONFIG.mass * 1.44,
				damping: native.YOU_BAR_SPRING_CONFIG.damping * 1.2,
				...(velocity !== undefined && {
					damping: native.YOU_BAR_SPRING_CONFIG.damping * 0.9,
					overshootClamping: false,
					velocity,
				}),
				toValue: next ? 1 : 0,
				useNativeDriver: true,
			}).start()
	}
	const listener = animation.addListener(({ value }) => {
		progress = Math.max(0, Math.min(1, value))
		if (!fullWidthList) notify()
	})
	cleanup(() => {
		active = false
		collapsed = false
		progress = 0
		animation.stopAnimation()
		animation.setValue(0)
		animation.removeListener(listener)
		notify()
	})
	cleanup(
		getModules(
			withProps<{ useYouBarTotalHeight(extra?: number): number }>(
				'useYouBarTotalHeight',
			),
			module => {
				cleanup(
					instead(module, 'useYouBarTotalHeight', function (args, original) {
						const height = Reflect.apply(original, this, args)
						const value = use(Inset)
						// The drawer already consumes this native inset; its own motion remains untouched.
						return height - value * distance()
					}),
				)
			},
		),
	)
	cleanup(
		getModuleWithImportedPath<{ default(): number }>(
			'modules/channel_list_v2/native/useChannelListWidth.tsx',
			module => {
				cleanup(
					after(
						module,
						'default',
						width => {
							const [layout] = lookupModule(
								withProps<{
									getChatLayout(): { isChatBesideChannelList: boolean }
								}>('getChatLayout'),
								{ initialize: false },
							)
							// Server Drawer replaces the guild rail by expanding this native list to the window width.
							const fullWidth =
								!!layout &&
								!layout.getChatLayout().isChatBesideChannelList &&
								PixelRatio.roundToNearestPixel(width) ===
									PixelRatio.roundToNearestPixel(Dimensions.get('window').width)
							if (fullWidthList !== fullWidth) {
								fullWidthList = fullWidth
								queueMicrotask(notify)
							}
							return width
						},
						{ priority: -100 },
					),
				)
			},
		),
	)
	cleanup(
		getModules(
			withProps<GestureLibrary>('Gesture', 'GestureDetector'),
			library => {
				type Detector = ReactElement<{
					gesture: unknown
					children: ReactElement<ViewProps>
				}>
				function DrawerGesture({ tree }: { tree: Detector }) {
					const drawer = use(Drawer)
					const slop = panelConfig()?.touchSlopForPanGesture
					const expanded = tree.props.children.props.accessibilityViewIsModal
					const gesture = useMemo(() => {
						if (!drawer || slop === undefined) return
						// Native recognizers run together even when Android cancels JS touch delivery.
						const restore = library.Gesture.Pan()
							.enabled(!expanded)
							.activeOffsetY(-slop)
							.failOffsetX([-slop * 3, slop * 3])
							.maxPointers(1)
							.runOnJS(true)
							.onUpdate(event => {
								if (active && collapsed && event.translationY < -slop)
									settle(false)
							})
						return library.Gesture.Simultaneous(tree.props.gesture, restore)
					}, [drawer, slop, expanded, tree.props.gesture])
					const attached = gesture !== undefined
					useEffect(() => {
						if (!attached) return
						drawerGestures++
						notify()
						return () => {
							drawerGestures--
							notify()
						}
					}, [attached])
					return gesture ? cloneElement(tree, { gesture }) : tree
				}
				cleanup(
					afterJSX(library.GestureDetector, tree => {
						const child = tree.props.children
						return isValidElement<ViewProps>(child) &&
							typeof child.props.accessibilityViewIsModal === 'boolean' ? (
							<DrawerGesture tree={tree as Detector} />
						) : (
							tree
						)
					}),
				)
			},
		),
	)
	function DrawerOffset({ tree }: { tree: ReactElement<DrawerProps> }) {
		const inset = use(Inset)
		const target = inset * distance()
		const offset = useRef(new Animated.Value(target)).current
		useLayoutEffect(() => {
			const native = constants()
			if (!native) return
			if (
				'useReducedMotion' in Stores.AccessibilityStore &&
				Stores.AccessibilityStore.useReducedMotion === true
			) {
				offset.setValue(target)
				return
			}
			const motion = Animated.spring(offset, {
				...native.YOU_BAR_SPRING_CONFIG,
				mass: native.YOU_BAR_SPRING_CONFIG.mass * 1.44,
				damping: native.YOU_BAR_SPRING_CONFIG.damping * 1.05,
				overshootClamping: false,
				toValue: target,
				useNativeDriver: true,
			})
			motion.start()
			return () => motion.stop()
		}, [offset, target])
		return (
			<AnimatedView
				pointerEvents="box-none"
				style={{
					position: 'absolute',
					top: 0,
					bottom: 0,
					left: 0,
					right: 0,
					transform: [{ translateY: offset }],
				}}
			>
				<Drawer value={true}>
					{cloneElement(tree, { bottomInset: tree.props.bottomInset + target })}
				</Drawer>
			</AnimatedView>
		)
	}
	// Discover the keyed surface once, then patch only its JSX type. No drawer internals are changed.
	const discovery: (() => unknown)[] = []
	const discoverDrawer = (tree: ReactElement<unknown>) => {
		if (
			tree?.key !== 'server-drawer' ||
			typeof tree.type !== 'function' ||
			!tree.props ||
			typeof tree.props !== 'object' ||
			!('bottomInset' in tree.props) ||
			typeof tree.props.bottomInset !== 'number' ||
			!('onWidthChange' in tree.props) ||
			typeof tree.props.onWidthChange !== 'function'
		)
			return tree
		onDrawer()
		const surface = tree as ReactElement<
			DrawerProps,
			ComponentType<DrawerProps>
		>
		const wrap = (element: ReactElement<DrawerProps>) => (
			<DrawerOffset key={element.key} tree={element} />
		)
		cleanup(afterJSX(surface.type, wrap))
		discovery.splice(0).forEach(unpatch => unpatch())
		return wrap(surface)
	}
	for (const key of ['jsx', 'jsxs'] as const)
		discovery.push(after(ReactJSXRuntime, key, discoverDrawer))
	cleanup(() => discovery.splice(0).forEach(unpatch => unpatch()))

	function Bar({ tree }: { tree: Tree }) {
		useWindowDimensions()
		const handleColor = useStyles().handle.backgroundColor
		const enabled =
			jsonStorage.use()?.collapsibleYouBar ?? defaults.collapsibleYouBar
		const running = useSyncExternalStore(subscribe, () => active)
		const hidden = useSyncExternalStore(subscribe, () => collapsed)
		const drawer = useSyncExternalStore(
			subscribe,
			() => fullWidthList && drawerGestures > 0,
		)
		const native = useMemo(() => {
			const config = panelConfig()
			const Chevron = lookupGeneratedIconComponent('ChevronSmallUpIcon')
			return config && Chevron ? { config, Chevron } : undefined
		}, [])
		useEffect(() => {
			if (!enabled) settle(false)
		}, [enabled])
		useEffect(() => {
			if (!native)
				plugin.reportError(
					'The native You bar gesture controls are unavailable.',
				)
		}, [native])
		const touches = useMemo(() => {
			const slop = native?.config.touchSlopForPanGesture ?? 0
			function drag(up: boolean) {
				let origin: { x: number; y: number } | undefined
				return {
					onStartShouldSetResponderCapture(event: GestureResponderEvent) {
						origin = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }
						return false
					},
					onMoveShouldSetResponderCapture(event: GestureResponderEvent) {
						if (
							!origin ||
							!enabled ||
							!running ||
							event.nativeEvent.touches.length !== 1
						)
							return false
						const x = event.nativeEvent.pageX - origin.x,
							y = event.nativeEvent.pageY - origin.y
						if (Math.abs(x) > slop * 3 || (up ? y > slop : y < -slop)) {
							origin = undefined
							return false
						}
						return up ? y < -slop : y > slop
					},
					onResponderRelease() {
						origin = undefined
						settle(!up)
					},
					onResponderTerminate() {
						origin = undefined
					},
					onResponderTerminationRequest: () => false,
				}
			}
			return { down: drag(false), up: drag(true) }
		}, [native, enabled, running])
		const [gestures] = lookupModule(
			withProps<GestureLibrary>('Gesture', 'GestureDetector'),
			{ initialize: false },
		)
		const pull = usePullHandle(
			gestures,
			animation,
			hidden,
			distance(),
			native?.config.touchSlopForPanGesture ?? 0,
			settle,
		)
		if (!running || !native) return tree
		const children = Children.toArray(tree.props.children)
		const insets = safeArea()?.getSafeAreaInsets()
		const moving = children.filter(
			child =>
				isValidElement(child) &&
				['YouBar', 'YouBarFloatingShade'].includes(
					componentName(child.type) ?? '',
				),
		)
		if (!insets || moving.length !== 2) return tree
		const remaining = children.filter(child => !moving.includes(child))
		const interpolate = (outputRange: number[]) =>
			animation.interpolate({
				inputRange: [0, 1],
				outputRange,
				extrapolate: 'clamp',
			})
		return cloneElement(
			tree,
			{},

			<AnimatedView
				collapsable={false}
				{...touches.down}
				pointerEvents={hidden ? 'none' : 'box-none'}
				accessibilityElementsHidden={hidden}
				importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
				style={{
					position: 'absolute',
					top: 0,
					bottom: 0,
					left: 0,
					right: 0,
					transform: [
						{
							translateY: animation.interpolate({
								inputRange: [0, 1],
								outputRange: [0, distance()],
							}),
						},
					],
					opacity: interpolate([1, 0]),
				}}
			>
				{moving}
			</AnimatedView>,
			remaining,
			!drawer && gestures && pull.gesture && (
				<AnimatedView
					collapsable={false}
					pointerEvents={hidden ? 'auto' : 'none'}
					style={{
						position: 'absolute',
						bottom: Math.max(
							0,
							insets.bottom - (constants()?.YOU_BAR_PADDING ?? 0),
						),
						alignSelf: 'center',
						opacity: pull.dragging ? 1 : interpolate([0, 1]),
						transform: [
							{
								translateY: animation.interpolate({
									inputRange: [0, 1],
									outputRange: [-distance(), 0],
								}),
							},
						],
					}}
				>
					<View
						style={{
							width: 44,
							height: 44,
							alignItems: 'center',
							justifyContent: 'center',
						}}
					>
						<gestures.GestureDetector gesture={pull.gesture}>
							<View
								onAccessibilityTap={() => settle(false, 0)}
								onAccessibilityAction={() => settle(false, 0)}
								accessible
								accessibilityActions={[{ name: 'activate' }]}
								accessibilityRole="button"
								accessibilityLabel="Expand You bar"
								style={{
									width: HANDLE_SIZE,
									height: HANDLE_SIZE,
									borderRadius: HANDLE_SIZE / 2,
									backgroundColor: handleColor,
									alignItems: 'center',
									justifyContent: 'center',
								}}
							>
								<native.Chevron size="sm" color="white" />
							</View>
						</gestures.GestureDetector>
					</View>
				</AnimatedView>
			),
		)
	}
	const withMemoName = createFilterGenerator(
		(
			[name]: [string],
			_id,
			value,
		): value is { type(props: { insetEnd?: number }): Tree } =>
			value !== null &&
			typeof value === 'object' &&
			'type' in value &&
			typeof value.type === 'function' &&
			(value.type.name === name ||
				('displayName' in value.type && value.type.displayName === name)),
		([name]) => `uiTweaks.youBarMemo:${name}`,
	)
	cleanup(
		getModules(withMemoName('YouBarThemed'), module =>
			cleanup(after(module, 'type', tree => <Bar tree={tree} />)),
		),
	)
	function Panel({ tree }: { tree: Tree }) {
		// Keep the list inset current; DrawerOffset moves the drawer without resizing its contents.
		const value = useSyncExternalStore(subscribe, () =>
			fullWidthList ? Number(collapsed) : progress,
		)

		return (
			<Inset value={value}>
				<View collapsable={false} style={{ flex: 1 }}>
					{tree}
				</View>
			</Inset>
		)
	}
	cleanup(
		getModuleWithImportedPath<{ default: { type(): Tree } }>(
			'components_native/MainChannels.tsx',
			module => {
				cleanup(
					after(module.default, 'type', tree => <Panel tree={tree} />, {
						priority: -100,
					}),
				)
			},
		),
	)
}

function componentName(type: unknown): string | undefined {
	if (typeof type === 'function')
		return 'displayName' in type && typeof type.displayName === 'string'
			? type.displayName
			: type.name
	if (type && typeof type === 'object' && 'type' in type)
		return componentName(type.type)
}

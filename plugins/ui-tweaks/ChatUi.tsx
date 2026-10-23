import { Tokens } from '@revenge-mod/discord/common/tokens'
import { Design } from '@revenge-mod/discord/design'
import { onFluxEventDispatched, Stores } from '@revenge-mod/discord/flux'
import { RootNavigationRef } from '@revenge-mod/discord/modules/main_tabs_v2'
import { getModules, lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { after } from '@revenge-mod/patcher'
import { asap } from '@revenge-mod/utils/callback'
import { lookupGeneratedIconComponent } from '@revenge-mod/utils/discord'
import { findInTree } from '@revenge-mod/utils/tree'
import {
	cloneElement,
	createContext,
	isValidElement,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from 'react'
import {
	Animated,
	Keyboard,
	Platform,
	useWindowDimensions,
	View,
} from 'react-native'
import { barHapticFeedback, HANDLE_SIZE, usePullHandle } from './PullHandle'
import { defaults } from './Settings'
import type { PluginApi } from '@revenge-mod/plugins/types'
import type {
	ComponentType,
	Context,
	ReactElement,
	ReactNode,
	RefObject,
} from 'react'
import type { NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native'
import type {
	BarSpring,
	GestureLibrary,
	NativeGesture,
	PanGesture,
} from './PullHandle'
import type { Settings } from './Settings'

interface Channel {
	id: string
	guild_id?: string
	isThread(): boolean
}

export interface HostProps {
	ref?: RefObject<{ dismissKeyboard(): void } | null>
	children?: ReactNode
	gesture?: unknown
	channelId?: string
	channel?: Channel
	screenIndex?: number
	screenStackActive?: boolean
	pendingReply?: unknown
	pendingEdit?: unknown
	style?: StyleProp<ViewStyle>
	pointerEvents?: 'none' | 'auto'
	accessibilityElementsHidden?: boolean
	importantForAccessibility?: 'no-hide-descendants' | 'auto'
	onChatScrollPosition?: (
		event: NativeSyntheticEvent<{ isAtBottom: boolean }>,
	) => void
}

export type HostTree = ReactElement<HostProps>
export interface ChannelDetailsProps {
	channelId: string
	componentWidth: number
	isSearchLocked: boolean
	isShowing: boolean
	onBackPress(): void
}

export interface SearchTabsOptions {
	items: { id: string; label: string; page: ReactNode }[]
	visibleTabs: string[]
	onSelectedTabChange(tab: string): void
	width: number
}
export interface SearchTabsState {
	segmentedControlState: {
		items: { id: string }[]
		setActiveIndex(index: number): void
	}
}
interface SearchQueryManager {
	markExplicitSearchSubmitted(): void
}
interface PanelGesture {
	gesture: unknown
	disallowGesture: { set(value: boolean): void }
}
interface SwipeContext extends PanelGesture {
	channelId: string
	screenIndex?: number
}
interface ChatGestures {
	library: GestureLibrary
	vertical: PanGesture
	pager: NativeGesture
	native: NativeGesture
}

export function createChatUi(
	{ jsonStorage, cleanup, plugin }: PluginApi<{ jsonStorage: Settings }>,
	loadChannelDetails: () => ComponentType<ChannelDetailsProps> | undefined,
) {
	const useStyles = Design.createStyles({
		handle: { backgroundColor: Tokens.default.colors.BACKGROUND_SURFACE_HIGH },
	})
	const AnimatedView = Animated.View
	let running = true
	const listeners = new Set<() => void>()
	const subscribe = (listener: () => void) => {
		listeners.add(listener)
		return () => {
			listeners.delete(listener)
		}
	}
	const snapshot = () => running

	const resetChatTabs = new Set<() => void>()
	const ChatPageContext = createContext<{
		chat: HostTree
		channelId: string
		panel: PanelGesture | undefined
		gestures: ChatGestures | undefined
	} | null>(null)
	cleanup(() => {
		running = false
		listeners.forEach(listener => listener())
		resetChatTabs.forEach(reset => reset())
		resetChatTabs.clear()
	})
	function useSettings() {
		const active = useSyncExternalStore(subscribe, snapshot)
		const settings = { ...defaults, ...jsonStorage.use() }
		return {
			improvedHeader: active && settings.improvedHeader,
			collapsibleInput: active && settings.collapsibleInput,
		}
	}
	function ChannelPage({ tree }: { tree: HostTree }) {
		const { improvedHeader } = useSettings()
		const Details = useMemo(
			() => (improvedHeader ? loadChannelDetails() : undefined),
			[improvedHeader],
		)
		useEffect(() => {
			if (improvedHeader && !Details)
				plugin.reportError('The channel details page is unavailable.')
		}, [improvedHeader, Details])
		const { width } = useWindowDimensions()
		const fragment = tree.props.children
		if (!improvedHeader || !Details || !isValidElement<HostProps>(fragment))
			return tree
		const children = fragment.props.children
		if (!Array.isArray(children)) return tree
		const [header, chat] = children
		if (
			!isValidElement<HostProps>(header) ||
			!isValidElement<HostProps>(chat) ||
			typeof header.props.channelId !== 'string'
		)
			return tree
		const [panel] = lookupModule(
			withProps<{
				default: Context<PanelGesture | undefined>
				MainTabsChannelScreenStackContext: unknown
			}>('MainTabsChannelScreenStackContext'),
			{ initialize: false },
		)
		if (!panel) return tree
		return (
			<ChannelTabs
				tree={tree}
				chat={chat}
				channelId={header.props.channelId}
				screenIndex={header.props.screenIndex}
				Details={Details}
				width={width}
				PanelContext={panel.default}
			/>
		)
	}
	function ChannelTabs({
		tree,
		chat,
		channelId,
		screenIndex,
		Details,
		width,
		PanelContext,
	}: {
		tree: HostTree
		chat: HostTree
		channelId: string
		screenIndex?: number
		Details: ComponentType<ChannelDetailsProps>
		width: number
		PanelContext: Context<PanelGesture | undefined>
	}) {
		const [SwipeContext, setSwipeContext] = useState(() =>
			createContext<SwipeContext | undefined>(undefined),
		)
		useEffect(
			() =>
				getModules(
					withProps<{
						SwipeForMemberListContext: Context<SwipeContext | undefined>
					}>('SwipeForMemberListContext'),
					module => setSwipeContext(module.SwipeForMemberListContext),
				),
			[],
		)
		const panel = useContext(PanelContext)
		const [library] = lookupModule(
			withProps<GestureLibrary>('Gesture', 'GestureDetector'),
			{ initialize: false },
		)
		const gestures = useMemo(() => {
			if (!library || !panel) return
			// Let vertical chat scrolling win before the horizontal pager can intercept.
			const vertical = library.Gesture.Pan()
				.activeOffsetY([-10, 10])
				.failOffsetX([-24, 24])
			const pager = library.Gesture.Native()
				.simultaneousWithExternalGesture(panel.gesture)
				.requireExternalGestureToFail(vertical)
			const native =
				library.Gesture.Native().simultaneousWithExternalGesture(pager)
			return { library, vertical, pager, native }
		}, [library, panel])
		const context = useMemo(
			() => ({ chat, channelId, panel, gestures }),
			[chat, channelId, panel, gestures],
		)
		const swipe = useMemo(
			() =>
				panel && {
					...panel,
					channelId: channelId,
					screenIndex: screenIndex,
				},
			[panel, channelId, screenIndex],
		)
		// Give the native pager the channel panel's gesture coordination.
		return cloneElement(
			tree,
			{},
			<ChatPageContext.Provider value={context}>
				<SwipeContext.Provider value={swipe}>
					<Details
						key={channelId}
						channelId={channelId}
						componentWidth={width}
						isSearchLocked={false}
						isShowing
						onBackPress={() =>
							RootNavigationRef.getRootNavigationRef().goBack()
						}
					/>
				</SwipeContext.Provider>
			</ChatPageContext.Provider>,
		)
	}
	function DirectionalPages({
		tree,
		state,
	}: {
		tree: HostTree
		state: SearchTabsState['segmentedControlState']
	}) {
		const context = useContext(ChatPageContext)
		const { improvedHeader } = useSettings()
		const channelId = improvedHeader ? context?.channelId : undefined
		const [requestedTab, setRequestedTab] = useState<string>()
		const index = state.items.findIndex(item => item.id === requestedTab)
		useEffect(() => {
			if (!channelId || index < 0) return
			let cancelled = false
			const select = () => {
				if (cancelled || !running) return
				state.setActiveIndex(index)
				setRequestedTab(undefined)
			}
			if (requestedTab === 'ui-tweaks-chat') {
				const [navigation] = lookupModule(
					withProps<{
						delayUntilNavigationComplete(callback: () => void): void
						performKeyboardAwareNavigation(callback: () => void): void
					}>('delayUntilNavigationComplete', 'performKeyboardAwareNavigation'),
					{ initialize: false },
				)
				if (!navigation) {
					plugin.reportError('Search navigation is unavailable.')
					return
				}
				// The search preview must close before the channel pager can scroll.
				navigation.delayUntilNavigationComplete(select)
			} else {
				// Let Discord finish updating the search tabs before selecting results.
				asap(select)
			}
			return () => {
				cancelled = true
			}
		}, [channelId, index, requestedTab, state])
		useEffect(() => {
			if (!channelId) return
			const cancelSearch = onFluxEventDispatched<{
				id: string
				updater(manager: SearchQueryManager): void
			}>('SEARCH_QUERY_NATIVE_UPDATE', payload => {
				if (payload.id !== channelId) return payload
				return {
					...payload,
					updater(manager) {
						const unpatch = after(
							manager,
							'markExplicitSearchSubmitted',
							result => {
								setRequestedTab('messages')
								return result
							},
						)
						try {
							return Reflect.apply(payload.updater, this, [manager])
						} finally {
							unpatch()
						}
					},
				}
			})
			const cancelJump = onFluxEventDispatched<{
				channelId: string
				messageId?: string
			}>('CHANNEL_SELECT', payload => {
				if (payload.channelId === channelId && payload.messageId)
					setRequestedTab('ui-tweaks-chat')
				return payload
			})
			return () => {
				cancelSearch()
				cancelJump()
			}
		}, [channelId])
		return context?.gestures
			? cloneElement(tree, { gesture: context.gestures.pager })
			: tree
	}
	function DirectionalChat({ tree }: { tree: HostTree }) {
		const context = useContext(ChatPageContext)
		const gestures = context?.gestures
		const gesture = useMemo(
			() =>
				gestures?.library.Gesture.Simultaneous(
					gestures.native,
					gestures.vertical,
				),
			[gestures],
		)
		if (!gestures || !gesture) return tree
		return (
			<gestures.library.GestureDetector gesture={gesture}>
				{tree}
			</gestures.library.GestureDetector>
		)
	}
	function ChannelStack({
		tree,
		active,
	}: {
		tree: HostTree
		active?: boolean
	}) {
		useEffect(() => {
			if (active === false) resetChatTabs.forEach(reset => reset())
		}, [active])
		return tree
	}
	function useChatTabState(state: SearchTabsState) {
		const context = useContext(ChatPageContext)
		const control = useRef(state.segmentedControlState)
		control.current = state.segmentedControlState
		const panel = context?.panel
		useEffect(() => {
			if (!panel) return
			const reset = () => {
				control.current.setActiveIndex(0)
				panel.disallowGesture.set(false)
			}
			resetChatTabs.add(reset)
			return () => {
				resetChatTabs.delete(reset)
				panel.disallowGesture.set(false)
			}
		}, [panel])
		return state
	}

	function useChatTab(options: SearchTabsOptions): SearchTabsOptions {
		const context = useContext(ChatPageContext)
		if (!context) return options
		return {
			...options,
			items: [
				{ id: 'ui-tweaks-chat', label: 'Chat', page: context.chat },
				...options.items,
			],
			visibleTabs: ['ui-tweaks-chat', ...options.visibleTabs],
			onSelectedTabChange(tab) {
				context.panel?.disallowGesture.set(tab !== 'ui-tweaks-chat')
				if (tab !== 'ui-tweaks-chat') options.onSelectedTabChange(tab)
			},
		}
	}
	function Composer({
		tree,
		inputRef,
	}: {
		tree: HostTree
		inputRef?: HostProps['ref']
	}) {
		const { collapsibleInput } = useSettings()
		const handleColor = useStyles().handle.backgroundColor
		const [collapsed, setCollapsed] = useState(false)
		const hidden = collapsibleInput && collapsed
		const hiddenRef = useRef(hidden)
		hiddenRef.current = hidden
		const animation = useRef(new Animated.Value(0)).current
		const target = useRef(false)
		const [height, setHeight] = useState(0)
		const [nativeSpring] = lookupModule(
			withProps<BarSpring>('YOU_BAR_SPRING_CONFIG'),
			{ initialize: false },
		)
		const animate = useCallback(
			(next: boolean, velocity = 0) => {
				target.current = next
				animation.stopAnimation()
				if (
					!nativeSpring ||
					('useReducedMotion' in Stores.AccessibilityStore &&
						Stores.AccessibilityStore.useReducedMotion === true)
				) {
					animation.setValue(next ? 1 : 0)
					return
				}
				Animated.spring(animation, {
					...nativeSpring.YOU_BAR_SPRING_CONFIG,
					damping: nativeSpring.YOU_BAR_SPRING_CONFIG.damping * 0.75,
					overshootClamping: false,
					velocity,
					toValue: next ? 1 : 0,
					useNativeDriver: false,
				}).start()
			},
			[animation, nativeSpring],
		)
		const settle = useCallback(
			(next: boolean, velocity: number) => {
				if (next) {
					inputRef?.current?.dismissKeyboard()
					Keyboard.dismiss()
				}
				if (hiddenRef.current !== next) barHapticFeedback()
				hiddenRef.current = next
				setCollapsed(next)
				animate(next, velocity)
			},
			[animate, inputRef],
		)
		useEffect(() => {
			if (target.current !== hidden) animate(hidden)
		}, [animate, hidden])
		useEffect(() => () => animation.stopAnimation(), [animation])

		const context = findInTree(
			tree,
			(node): node is HostTree =>
				isValidElement<HostProps>(node) && 'pendingReply' in node.props,
			{ walkable: new Set(['props', 'children']) },
		)
		useEffect(() => {
			if (context?.props.pendingReply || context?.props.pendingEdit)
				setCollapsed(false)
		}, [context?.props.pendingReply, context?.props.pendingEdit])
		useEffect(() => {
			if (!hidden) return
			const subscription = Keyboard.addListener('keyboardDidShow', () =>
				setCollapsed(false),
			)
			return () => subscription.remove()
		}, [hidden])
		useEffect(() => {
			if (!hidden || tree.props.screenIndex === undefined) return
			const [layout] = lookupModule(
				withProps<{
					default: {
						getState(): { chatInputContainerHeight: Map<number, number> }
					}
					updateChatInputContainerHeight(
						screenIndex: number,
						height: number,
					): void
				}>('updateChatInputContainerHeight', 'default'),
				{ initialize: false },
			)
			const index = tree.props.screenIndex
			const height = layout?.default
				.getState()
				.chatInputContainerHeight.get(index)
			if (!layout || height === undefined) return
			// Discord positions its jump button from this measurement, not the hidden wrapper.
			layout.updateChatInputContainerHeight(index, 0)
			return () => layout.updateChatInputContainerHeight(index, height)
		}, [hidden, tree.props.screenIndex])

		useEffect(() => {
			if (!collapsibleInput) setCollapsed(false)
		}, [collapsibleInput])
		const page = useContext(ChatPageContext)
		const coordinated = page?.gestures
		const [library] = lookupModule(
			withProps<GestureLibrary>('Gesture', 'GestureDetector'),
			{ initialize: false },
		)
		const [panels] = lookupModule(
			withProps<{
				ANDROID_PANELS_ANIMATION_CONFIG: { touchSlopForPanGesture: number }
				DEFAULT_PANELS_ANIMATION_CONFIG: { touchSlopForPanGesture: number }
			}>('ANDROID_PANELS_ANIMATION_CONFIG', 'DEFAULT_PANELS_ANIMATION_CONFIG'),
			{ initialize: false },
		)
		const slop = (
			Platform.OS === 'android'
				? panels?.ANDROID_PANELS_ANIMATION_CONFIG
				: panels?.DEFAULT_PANELS_ANIMATION_CONFIG
		)?.touchSlopForPanGesture
		const pull = usePullHandle(
			library,
			animation,
			hidden,
			height,
			slop ?? 0,
			settle,
		)
		const gesture = useMemo(() => {
			if (!library || slop === undefined) return
			return library.Gesture.Pan()
				.enabled(collapsibleInput && !hidden && !pull.dragging)
				.runOnJS(true)
				.activeOffsetY([-slop, slop])
				.failOffsetX([-slop * 3, slop * 3])
				.simultaneousWithExternalGesture(
					...(coordinated
						? [coordinated.native, coordinated.vertical, coordinated.pager]
						: []),
					...(page?.panel ? [page.panel.gesture] : []),
				)
				.onEnd((event, success) => {
					const next = event.translationY > 0
					if (!success || hiddenRef.current === next) return
					settle(next, event.velocityY / Math.max(1, height))
				})
		}, [
			library,
			collapsibleInput,
			hidden,
			pull.dragging,
			settle,
			height,
			coordinated,
			page?.panel,
			slop,
		])

		const Chevron = useMemo(
			() => lookupGeneratedIconComponent('ChevronSmallUpIcon'),
			[],
		)
		const child = tree.props.children
		if (!collapsibleInput || !isValidElement<HostProps>(child)) return tree
		const composer = cloneElement(
			tree,
			{},
			cloneElement(child, {
				style: [child.props.style, { marginTop: 0 }],
				pointerEvents: hidden ? 'none' : 'auto',
				accessibilityElementsHidden: hidden,
				importantForAccessibility: hidden ? 'no-hide-descendants' : 'auto',
			}),
		)
		const interpolate = (outputRange: number[]) =>
			animation.interpolate({
				inputRange: [0, 1],
				outputRange,
				extrapolate: 'clamp',
			})
		return library && gesture && pull.gesture ? (
			<AnimatedView style={{ flex: 0, marginTop: -HANDLE_SIZE }}>
				<View collapsable={false} pointerEvents="box-none">
					<library.GestureDetector gesture={pull.gesture}>
						<View
							collapsable={false}
							accessibilityRole="button"
							accessibilityLabel={
								hidden ? 'Expand chat bar' : 'Collapse chat bar'
							}
							accessible
							accessibilityActions={[{ name: 'activate' }]}
							onAccessibilityTap={() => settle(!hidden, 0)}
							onAccessibilityAction={() => settle(!hidden, 0)}
							style={{
								height: HANDLE_SIZE,
								width: HANDLE_SIZE,
								alignSelf: 'center',
								borderRadius: HANDLE_SIZE / 2,
								transform: [{ translateY: -18 }],
								backgroundColor: handleColor,
								alignItems: 'center',
								justifyContent: 'center',
							}}
						>
							{Chevron && (
								<AnimatedView
									style={{
										transform: [
											{
												rotate: animation.interpolate({
													inputRange: [0, 1],
													outputRange: ['180deg', '0deg'],
													extrapolate: 'clamp',
												}),
											},
										],
									}}
								>
									<Chevron size="sm" color="white" />
								</AnimatedView>
							)}
						</View>
					</library.GestureDetector>
					<library.GestureDetector gesture={gesture}>
						<AnimatedView
							collapsable={false}
							pointerEvents={hidden ? 'none' : 'auto'}
							style={{
								height: animation.interpolate({
									inputRange: [0, 1, 1.12],
									outputRange: [height, 0, 0],
								}),
								opacity: interpolate([1, 0]),
								overflow: 'hidden',
							}}
						>
							<View
								style={{ position: 'absolute', left: 0, right: 0, top: 0 }}
								onLayout={event => setHeight(event.nativeEvent.layout.height)}
							>
								{composer}
							</View>
						</AnimatedView>
					</library.GestureDetector>
				</View>
			</AnimatedView>
		) : (
			tree
		)
	}

	return {
		useChatTab,
		useChatTabState,
		SegmentedControlPages: (
			tree: HostTree,
			state: SearchTabsState['segmentedControlState'],
		) => <DirectionalPages tree={tree} state={state} />,
		MainTabsChannelScreenStack: (tree: HostTree, active?: boolean) => (
			<ChannelStack tree={tree} active={active} />
		),
		StandaloneChannelScreen: (tree: HostTree) => <ChannelPage tree={tree} />,
		ChatInput: (tree: HostTree, inputRef?: HostProps['ref']) => (
			<Composer tree={tree} inputRef={inputRef} />
		),
		Chat: (tree: HostTree) => <DirectionalChat tree={tree} />,
	}
}

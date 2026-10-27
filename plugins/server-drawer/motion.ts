import { Stores } from '@revenge-mod/discord/flux'
import { lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Platform, Pressable } from 'react-native'
import type * as t from './types'

export function createDrawerMotion(Gesture: t.NativeGestureModule['Gesture']) {
	const [panels] = lookupModule(
		withProps<t.DiscordPanelsConfig>(
			'DEFAULT_PANELS_ANIMATION_CONFIG',
			'ANDROID_PANELS_ANIMATION_CONFIG',
		),
	)
	const [springs] = lookupModule(
		withProps<{
			SUBTLE_SPRING: t.MotionSpring
			springUnclamped: t.MotionSpring
		}>('SUBTLE_SPRING', 'springUnclamped'),
	)
	const [quest] = lookupModule(
		withProps<{ QUEST_DOCK_MODE_CHANGE_PHYSICS: t.MotionSpring }>(
			'QUEST_DOCK_MODE_CHANGE_PHYSICS',
		),
	)
	const [haptics] = lookupModule(
		withProps<{
			HapticFeedbackTypes: { IMPACT_LIGHT: number }
			triggerHapticFeedback(type: number): void
		}>('triggerHapticFeedback', 'HapticFeedbackTypes'),
	)
	const subtleSpring = springs?.SUBTLE_SPRING
	const accessibility =
		Stores.AccessibilityStore as import('@revenge-mod/discord/types').DiscordModules.Flux.Store<t.DrawerAccessibilityStore>
	if (!panels)
		throw new Error('Server Drawer: native panel configuration is unavailable')
	const config =
		Platform.OS === 'android'
			? panels.ANDROID_PANELS_ANIMATION_CONFIG
			: panels.DEFAULT_PANELS_ANIMATION_CONFIG

	if (
		!panels ||
		!subtleSpring ||
		!springs?.springUnclamped ||
		!quest ||
		!haptics ||
		!config ||
		typeof panels.isTimingConfig !== 'function' ||
		typeof Gesture?.Pan !== 'function' ||
		typeof accessibility?.useReducedMotion !== 'boolean'
	) {
		throw new Error('ServerDrawer: native panel animations are unavailable')
	}

	// Held tiles stop waiting for their long press past the platform touch slop (8dp Android, 10pt iOS).
	// Drawer pans over tiles start beyond it, so drift during a hold cannot move the drawer.
	const holdSlop = Math.max(config.touchSlopForPanGesture, 12)
	const dockSpring = quest.QUEST_DOCK_MODE_CHANGE_PHYSICS
	const bounce = springs.springUnclamped
	const { triggerHapticFeedback, HapticFeedbackTypes } = haptics
	const lightImpact = () =>
		triggerHapticFeedback(HapticFeedbackTypes.IMPACT_LIGHT)

	const animate = (
		value: Animated.Value,
		next: number,
		open: boolean,
		complete?: Animated.EndCallback,
	) => {
		const animation = open
			? config.nonSwipeSidePanelOpen
			: config.nonSwipeSidePanelClose

		if (accessibility.useReducedMotion) {
			value.stopAnimation()
			value.setValue(next)
			complete?.({ finished: true })
			return
		}

		if (panels.isTimingConfig(animation)) {
			const easing =
				typeof animation.easing === 'object'
					? animation.easing.factory()
					: animation.easing
			Animated.timing(value, {
				...animation,
				easing,
				toValue: next,
				useNativeDriver: true,
			}).start(complete)
		} else {
			Animated.spring(value, {
				...animation,
				toValue: next,
				useNativeDriver: true,
			}).start(complete)
		}
	}

	const spring = (value: Animated.Value, next: number, velocity = 0) => {
		value.stopAnimation()
		if (accessibility.useReducedMotion) value.setValue(next)
		else
			Animated.spring(value, {
				...subtleSpring,
				velocity,
				toValue: next,
				useNativeDriver: true,
			}).start()
	}

	function useTranslation(next: number, animate = spring) {
		const [translate] = useState(() => new Animated.Value(next))
		const position = useRef(next)
		const target = useRef(next)
		const settle = (value: number, velocity = 0) => {
			target.current = value
			animate(translate, value, velocity)
		}

		useEffect(() => {
			const listener = translate.addListener(({ value }) => {
				position.current = value
			})

			return () => {
				translate.stopAnimation()
				translate.removeListener(listener)
			}
		}, [translate])

		useEffect(() => {
			if (target.current !== next) settle(next)
		}, [next])

		return { translate, position, target, settle }
	}

	function useDrawerMotion(
		expanded: boolean,
		minimum: number,
		maximum: number,
		dockHeight: number,
		panelHeight: number,
		soft: boolean,
		hapticsEnabled: boolean,
		listAtTop: boolean,
		dragging: boolean,
		onOpen: (open: boolean) => void,
		onMarkRead?: () => void,
	) {
		const distance = maximum - minimum
		const [openingFrom, setOpeningFrom] = useState<number>()
		const previousExpanded = useRef(expanded)
		const { translate, position, target, settle } = useTranslation(
			expanded ? 0 : distance,
			(value, next, velocity = 0) => {
				if (!soft) return spring(value, next, velocity)
				value.stopAnimation()
				if (next === 0 && (!expanded || !previousExpanded.current))
					setOpeningFrom(position.current)
				const complete = ({ finished }: Animated.EndResult) => {
					if (finished) setOpeningFrom(next === 0 ? 0 : undefined)
				}
				if (accessibility.useReducedMotion) {
					value.setValue(next)
					complete({ finished: true })
				} else {
					Animated.spring(value, {
						...(next === 0
							? dockSpring
							: {
									...bounce,
									mass: bounce.mass * 4,
									damping: bounce.damping * 2,
								}),
						toValue: next,
						velocity,
						// The floating dock and drawer share an animated clipping height.
						useNativeDriver: false,
					}).start(complete)
				}
			},
		)
		useEffect(() => {
			if (previousExpanded.current !== expanded) {
				previousExpanded.current = expanded
				if (hapticsEnabled) lightImpact()
			}
		}, [expanded, hapticsEnabled])
		const origin = useRef(0)
		const callback = useRef(onOpen)
		callback.current = onOpen
		const markRead = useRef(onMarkRead)
		markRead.current = onMarkRead
		const canPull = !expanded && !!onMarkRead
		const flattenDistance = Math.max(1, minimum - 8)

		const gestures = useMemo(() => {
			const configure = () => {
				let active = false
				let start = 0
				let pulling: boolean | undefined

				const pan = Gesture.Pan()
					.runOnJS(true)
					.shouldCancelWhenOutside(false)
					.enabled(!dragging && (!expanded || listAtTop))
					.activeOffsetY(
						canPull
							? [-config.touchSlopForPanGesture, config.touchSlopForPanGesture]
							: expanded
								? holdSlop
								: -config.touchSlopForPanGesture,
					)

				if (!canPull)
					pan.failOffsetY(
						expanded
							? -config.touchSlopForPanGesture
							: config.touchSlopForPanGesture,
					)

				return pan
					.failOffsetX([
						-config.touchSlopForPanGesture,
						config.touchSlopForPanGesture,
					])
					.onStart(event => {
						active = true
						start = event.translationY
						if (!expanded || !soft) setOpeningFrom(undefined)
						pulling = canPull ? undefined : false
						translate.stopAnimation()
						origin.current =
							Math.max(0, Math.min(distance, position.current)) -
							event.translationY
					})
					.onUpdate(event => {
						// Native pan activation can report zero translation before the first move.
						if (pulling === undefined && event.translationY !== 0)
							pulling = event.translationY > 0
						position.current = pulling
							? distance +
								Math.min(
									flattenDistance,
									Math.max(0, event.translationY) * 0.75,
								)
							: Math.max(
									0,
									Math.min(distance, origin.current + event.translationY),
								)
						if (soft && !expanded && !pulling) {
							const travel = Math.max(0, start - event.translationY)
							const progress = Math.min(1, travel / (distance * 0.25))
							// Ease into the lift cap; only release travel decides whether to open.
							position.current =
								distance - distance * 0.125 * (1 - (1 - progress) ** 2)
						}
						translate.setValue(position.current)
					})
					.onEnd((event, success) => {
						if (!success) return
						if (pulling) {
							const complete = position.current >= distance + flattenDistance
							settle(distance)
							if (complete) markRead.current?.()
							return
						}
						const fling = Math.abs(event.velocityY) > config.minFlingVelocityX
						const open =
							!soft || expanded
								? fling
									? event.velocityY < 0
									: position.current < distance / 2
								: start - event.translationY > distance * 0.25
						const velocity =
							!soft || expanded
								? event.velocityY
								: Math.max(-600, Math.min(600, event.velocityY)) *
									(open ? 1 : 0.5)
						settle(open ? 0 : distance, velocity)
						callback.current(open)
					})
					.onFinalize((_event, success) => {
						if (active && !success) settle(target.current)
						active = false
					})
			}

			return { gesture: configure(), overlayGesture: configure() }
		}, [
			expanded,
			distance,
			listAtTop,
			dragging,
			canPull,
			flattenDistance,
			soft,
		])

		const reveal = (collapsed: number, opened: number) => {
			if (soft) {
				if (openingFrom === undefined) return expanded ? opened : collapsed
				if (expanded && openingFrom === 0) return opened
			}
			return translate.interpolate({
				inputRange: [
					0,
					soft && expanded ? Math.max(1, openingFrom ?? distance) : distance,
				],
				outputRange: [opened, collapsed],
				extrapolate: 'clamp',
			})
		}
		const joined = panelHeight > maximum
		return {
			...gestures,
			panelStyle: {
				...(soft && {
					height: reveal(dockHeight, panelHeight),
					bottom: reveal(panelHeight - dockHeight, 0),
					borderBottomLeftRadius: reveal(24, joined ? 0 : 24),
					borderBottomRightRadius: reveal(24, joined ? 0 : 24),
					borderBottomWidth: reveal(1, joined ? 0 : 1),
				}),
				transform: [{ translateY: translate }],
			},
			compactStyle: { opacity: reveal(1, 0) },
			expandedStyle: { opacity: reveal(0, 1) },
		}
	}

	function usePageMotion(
		view: t.DrawerView,
		width: number,
		enabled: boolean,
		onView: (view: t.DrawerView) => void,
	) {
		const { translate, position, settle } = useTranslation(
			view === 'servers' ? 0 : -width,
		)
		const callback = useRef(onView)
		callback.current = onView

		const gesture = useMemo(() => {
			let active = false
			let origin = 0
			const finish = (next: number, velocity = 0) => {
				settle(next, velocity)
				callback.current(next === 0 ? 'servers' : 'dms')
			}
			const slop = config.touchSlopForPanGesture

			return Gesture.Pan()
				.runOnJS(true)
				.shouldCancelWhenOutside(false)
				.enabled(enabled)
				.activeOffsetX([-holdSlop, holdSlop])
				.failOffsetY([-slop, slop])
				.onStart(event => {
					active = true
					translate.stopAnimation()
					origin =
						Math.max(-width, Math.min(0, position.current)) - event.translationX
				})
				.onUpdate(event => {
					position.current = Math.max(
						-width,
						Math.min(0, origin + event.translationX),
					)
					translate.setValue(position.current)
				})
				.onEnd((event, success) => {
					if (!success) return
					const dms =
						Math.abs(event.velocityX) > config.minFlingVelocityX
							? event.velocityX < 0
							: position.current <= -width / 2
					finish(dms ? -width : 0, event.velocityX)
				})
				.onFinalize((_event, success) => {
					if (active && !success)
						finish(position.current <= -width / 2 ? -width : 0)
					active = false
				})
		}, [enabled, width])

		return { gesture, style: { transform: [{ translateX: translate }] } }
	}

	function useFolderPageMotion(folderId: string | undefined) {
		const [progress] = useState(() => new Animated.Value(folderId ? 1 : 0))
		const previous = useRef(folderId)

		useEffect(() => {
			if (previous.current === folderId) return
			previous.current = folderId
			spring(progress, folderId ? 1 : 0)

			return () => progress.stopAnimation()
		}, [folderId])

		const interpolate = (outputRange: number[]) =>
			progress.interpolate({
				inputRange: [0, 1],
				outputRange,
				extrapolate: 'clamp',
			})

		return {
			rootStyle: {
				opacity: interpolate([1, 0]),
				transform: [{ translateY: interpolate([0, -24]) }],
			},
			folderStyle: {
				opacity: interpolate([0, 1]),
				transform: [{ translateY: interpolate([24, 0]) }],
			},
		}
	}

	function useFolderOverlayMotion(folderId: string | undefined) {
		const [retainedId, setRetainedId] = useState(folderId)
		const [progress] = useState(() => new Animated.Value(0))

		useEffect(() => {
			let cancelled = false
			if (folderId) setRetainedId(folderId)
			animate(progress, folderId ? 1 : 0, !!folderId, ({ finished }) => {
				if (finished && !cancelled && !folderId) setRetainedId(undefined)
			})

			return () => {
				cancelled = true
				progress.stopAnimation()
			}
		}, [folderId])

		return {
			folderId: folderId ?? retainedId,
			backdropStyle: { opacity: progress },
			panelStyle: {
				transform: [
					{
						translateY: progress.interpolate({
							inputRange: [0, 1],
							outputRange: [24, 0],
							extrapolate: 'clamp',
						}),
					},
				],
			},
		}
	}

	function useCarouselMotion(
		State: t.NativeCarouselGestureModule['State'],
		step: number,
	) {
		const [position] = useState(() => new Animated.Value(0))
		const generation = useRef(0)
		const onGestureEvent = useMemo(
			() =>
				Animated.event([{ nativeEvent: { translationX: position } }], {
					useNativeDriver: true,
				}),
			[position],
		)
		useEffect(
			() => () => {
				generation.current++
				position.stopAnimation()
			},
			[position],
		)
		const settle = (token: number, velocity = 0) => {
			if (generation.current !== token) return
			position.stopAnimation(value => {
				if (generation.current !== token) return
				// Project the existing momentum, then decelerate directly into a full slot.
				const travel = accessibility.useReducedMotion ? 0 : velocity / 4
				const toValue = Math.round((value + travel) / step) * step
				if (accessibility.useReducedMotion) position.setValue(toValue)
				else
					Animated.timing(position, {
						toValue,
						duration: velocity
							? Math.max(
									140,
									Math.min(
										900,
										Math.abs((3000 * (toValue - value)) / velocity),
									),
								)
							: 180,
						easing: Easing.out(Easing.cubic),
						useNativeDriver: true,
						isInteraction: false,
					}).start()
			})
		}
		const onHandlerStateChange = ({
			nativeEvent: event,
		}: import('react-native').NativeSyntheticEvent<t.NativePanStateEvent>) => {
			if (event.state === State.BEGAN) {
				generation.current++
				position.stopAnimation()
				// Preserve the native position without waiting for a JS value callback.
				position.extractOffset()
			} else if (
				event.oldState === State.ACTIVE ||
				(event.oldState === State.BEGAN && event.state !== State.ACTIVE)
			) {
				const token = generation.current
				if (event.oldState === State.ACTIVE)
					position.setValue(event.translationX)
				position.flattenOffset()
				settle(
					token,
					event.state === State.END && event.oldState === State.ACTIVE
						? event.velocityX
						: 0,
				)
			}
		}
		return { position, onGestureEvent, onHandlerStateChange }
	}

	return {
		lightImpact,
		touchSlop: config.touchSlopForPanGesture,
		AnimatedView: Animated.View,
		AnimatedPressable: Animated.createAnimatedComponent(Pressable),
		useCarouselMotion,
		useDrawerMotion,
		usePageMotion,
		useFolderPageMotion,
		useFolderOverlayMotion,
	}
}

import { lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, ReactElement } from 'react'
import type { Animated, StyleProp, ViewStyle } from 'react-native'

export const HANDLE_SIZE = 34

export function barHapticFeedback() {
	const [haptics] = lookupModule(
		withProps<{
			HapticFeedbackTypes: { IMPACT_LIGHT: number }
			triggerHapticFeedback(type: number): void
		}>('triggerHapticFeedback', 'HapticFeedbackTypes'),
		{ initialize: false },
	)
	// Discord's trigger respects its enabled state and Android's system setting.
	haptics?.triggerHapticFeedback(haptics.HapticFeedbackTypes.IMPACT_LIGHT)
}

interface PullEvent {
	translationX: number
	translationY: number
	velocityY: number
}
export interface PanGesture {
	enabled(value: boolean): this
	activeOffsetY(value: number | [number, number]): this
	failOffsetX(value: number[]): this
	minDistance(value: number): this
	maxPointers(value: number): this
	shouldCancelWhenOutside(value: boolean): this
	onBegin(callback: () => void): this
	onUpdate(callback: (event: PullEvent) => void): this
	onEnd(callback: (event: PullEvent, success: boolean) => void): this
	onFinalize(callback: () => void): this
	simultaneousWithExternalGesture(...gestures: unknown[]): this
	runOnJS(value: boolean): this
}
interface TapGesture {
	runOnJS(value: boolean): this
	onEnd(callback: (event: unknown, success: boolean) => void): this
}
export interface NativeGesture {
	simultaneousWithExternalGesture(...gestures: unknown[]): this
	requireExternalGestureToFail(...gestures: unknown[]): this
}
export interface GestureLibrary {
	Gesture: {
		Native(): NativeGesture
		Pan(): PanGesture
		Tap(): TapGesture
		Exclusive(...gestures: unknown[]): { gestures: unknown[] }
		Simultaneous(...gestures: unknown[]): unknown
	}
	GestureDetector: ComponentType<{ gesture: unknown; children: ReactElement }>
	GestureHandlerRootView: ComponentType<{
		unstable_forceActive: boolean
		style: StyleProp<ViewStyle>
		children: ReactElement
	}>
}
export interface BarSpring {
	YOU_BAR_SPRING_CONFIG: {
		mass: number
		stiffness: number
		damping: number
		overshootClamping: boolean
	}
}

export function resistedPull(start: number, delta: number, distance: number) {
	const value = start + delta / (Math.max(1, distance) + Math.abs(delta) * 0.5)
	// A short elastic tail makes the limit feel soft instead of hitting a hard stop.
	if (value < 0) return -0.12 * (1 - Math.exp(value / 0.12))
	if (value > 1) return 1 + 0.12 * (1 - Math.exp((1 - value) / 0.12))
	return value
}

export function usePullHandle(
	library: GestureLibrary | undefined,
	animation: Animated.Value,
	closed: boolean,
	distance: number,
	slop: number,
	settle: (closed: boolean, velocity: number) => void,
) {
	const options = useRef({ closed, distance, slop, settle })
	options.current = { closed, distance, slop, settle }
	const value = useRef(closed ? 1 : 0)
	const [dragging, setDragging] = useState(false)
	useEffect(() => {
		const listener = animation.addListener(event => {
			value.current = event.value
		})
		return () => animation.removeListener(listener)
	}, [animation])
	const gesture = useMemo(() => {
		if (!library) return
		let origin: { value: number; closed: boolean } | undefined
		function finish(event?: PullEvent, success = false) {
			if (!origin) return
			const { slop, distance, settle } = options.current
			const moved = event && Math.abs(event.translationY) > slop
			const horizontal =
				event &&
				Math.abs(event.translationX) > Math.abs(event.translationY) &&
				Math.abs(event.translationX) > slop * 3
			const next =
				!success || horizontal
					? origin.closed
					: !moved
						? !origin.closed
						: Math.abs(event.velocityY) > 350
							? event.velocityY > 0
							: value.current >= 0.5
			origin = undefined
			setDragging(false)
			settle(
				next,
				success && moved
					? Math.max(-3, Math.min(3, event.velocityY / Math.max(1, distance)))
					: 0,
			)
		}
		const pan = library.Gesture.Pan()
			.minDistance(options.current.slop)
			.maxPointers(1)
			.shouldCancelWhenOutside(false)
			.runOnJS(true)
			.onBegin(() => {
				animation.stopAnimation()
				setDragging(true)
				origin = { value: value.current, closed: options.current.closed }
			})
			.onUpdate(event => {
				if (!origin || Math.abs(event.translationY) <= options.current.slop)
					return
				value.current = resistedPull(
					origin.value,
					event.translationY,
					options.current.distance,
				)
				animation.setValue(value.current)
			})
			.onEnd((event, success) => finish(event, success))
			.onFinalize(() => finish())
		const tap = library.Gesture.Tap()
			.runOnJS(true)
			.onEnd((_event, success) => {
				if (success) options.current.settle(!options.current.closed, 0)
			})
		return library.Gesture.Exclusive(pan, tap)
	}, [animation, library])
	return { gesture, dragging }
}

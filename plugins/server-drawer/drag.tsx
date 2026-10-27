/** @jsxImportSource . */
import { lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Animated } from 'react-native'
import type { View } from 'react-native'
import type * as t from './types'

export function createDragMotion(
	{ PanGestureHandler, State }: t.NativeCarouselGestureModule,
	longPressMs: number,
) {
	const [timings] = lookupModule(
		withProps<{
			timingStandard: { duration: number }
			timingFast: { duration: number }
		}>('timingStandard', 'timingFast'),
	)
	if (!timings)
		throw new Error('Server Drawer: native animation timings are unavailable')
	const { timingStandard, timingFast } = timings
	const ORIGIN: t.DragPoint = Object.freeze({ x: 0, y: 0 })

	const settle = (value: Animated.Value, toValue: number) =>
		Animated.timing(value, { ...timingFast, toValue, useNativeDriver: true })

	function usePreview(width: number, grid: boolean, feedback: t.DragFeedback) {
		const [x] = useState(() => new Animated.Value(0))
		const [y] = useState(() => new Animated.Value(0))
		const [scale] = useState(() => new Animated.Value(1))
		const merging = useRef(false)
		const style = useMemo(
			() => ({
				transform: [
					{ translateX: grid ? Animated.subtract(x, width / 2) : 0 },
					{ translateY: Animated.subtract(y, grid ? 48 : 41) },
					{ scale },
				],
			}),
			[x, y, scale, width, grid],
		)

		// Shrink the lifted tile over a folder target so the target's highlight stays visible around it.
		useEffect(
			() =>
				feedback.subscribe(() => {
					const next = feedback.active() && feedback.mergeReady()
					if (merging.current === next) return
					merging.current = next
					if (feedback.active()) settle(scale, next ? 0.8 : 1.05).start()
				}),
			[feedback, scale],
		)
		useEffect(() => () => scale.stopAnimation(), [scale])

		return { x, y, scale, style }
	}

	function DragTarget(properties: t.DragTargetProps) {
		const anchor = useRef<View>(null)
		const held = useRef<t.DragPoint | undefined>(undefined)
		const moving = useRef(false)
		const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
			undefined,
		)
		useEffect(
			() => () => {
				clearTimeout(focusTimer.current)
				held.current = undefined
			},
			[],
		)
		const callbacks = useRef(properties)
		callbacks.current = properties
		const { x, y, scale } = properties.preview
		const { feedback } = properties
		const [offset] = useState(() => new Animated.ValueXY())
		const [grow] = useState(() => new Animated.Value(1))
		const shown = useRef(ORIGIN)
		const merging = useRef(false)
		const style = useMemo(
			() => ({
				transform: [...offset.getTranslateTransform(), { scale: grow }],
			}),
			[offset, grow],
		)

		// Neighbours shift without re-rendering the drawer, so the pointer-driven preview keeps the JS thread.
		useEffect(() => {
			let animation: Animated.CompositeAnimation | undefined
			const update = () => {
				const { id } = callbacks.current
				const target = feedback.merging(id)
				if (merging.current !== target) {
					merging.current = target
					settle(grow, target ? 1.12 : 1).start()
				}
				const next = feedback.offset(id) ?? ORIGIN
				if (next.x === shown.current.x && next.y === shown.current.y) return
				shown.current = next
				animation?.stop()
				animation = Animated.timing(offset, {
					...timingFast,
					toValue: next,
					useNativeDriver: true,
				})
				animation.start()
			}
			const unsubscribe = feedback.subscribe(update)

			return () => {
				unsubscribe()
				animation?.stop()
				grow.stopAnimation()
			}
		}, [feedback, offset, grow])

		// A committed drop re-renders the list in its new order; clear the shift in that same commit.
		useLayoutEffect(() => {
			if (feedback.active()) return
			if (merging.current) {
				merging.current = false
				grow.stopAnimation()
				grow.setValue(1)
			}
			if (shown.current === ORIGIN) return
			shown.current = ORIGIN
			offset.stopAnimation()
			offset.setValue(ORIGIN)
		})

		const onGestureEvent = useMemo(
			() =>
				Animated.event([{ nativeEvent: { absoluteX: x, absoluteY: y } }], {
					useNativeDriver: false,
					listener: ({
						nativeEvent: event,
					}: import('react-native').NativeSyntheticEvent<t.NativePanStateEvent>) => {
						const start = held.current
						if (!start) return
						if (!moving.current) {
							if (
								Math.hypot(
									event.absoluteX - start.x,
									event.absoluteY - start.y,
								) <= 10
							)
								return
							moving.current = true
							clearTimeout(focusTimer.current)
							callbacks.current.onStart(start)
							Animated.timing(scale, {
								...timingStandard,
								toValue: 1.05,
								useNativeDriver: true,
							}).start()
						}
						callbacks.current.onMove({ x: event.absoluteX, y: event.absoluteY })
					},
				}),
			[x, y, scale],
		)
		const onHandlerStateChange = ({
			nativeEvent: event,
		}: import('react-native').NativeSyntheticEvent<t.NativePanStateEvent>) => {
			if (event.state === State.ACTIVE) {
				x.setValue(event.absoluteX)
				y.setValue(event.absoluteY)
				moving.current = false
				const point = { x: event.absoluteX, y: event.absoluteY }
				held.current = point
				clearTimeout(focusTimer.current)
				// Give a drag time to start before showing the stationary-hold menu.
				focusTimer.current = setTimeout(() => {
					anchor.current?.measureInWindow((x, y, width, height) => {
						if (held.current === point && !moving.current)
							callbacks.current.onHold({ x, y, width, height })
					})
				}, 250)
			} else if (event.oldState === State.ACTIVE) {
				clearTimeout(focusTimer.current)
				if (moving.current && event.state === State.END)
					callbacks.current.onDrop({
						x: event.absoluteX,
						y: event.absoluteY,
					})
				else if (moving.current || event.state !== State.END)
					callbacks.current.onCancel()
				held.current = undefined
				moving.current = false
				scale.stopAnimation()
				scale.setValue(1)
			}
		}

		return (
			<PanGestureHandler
				enabled
				activateAfterLongPress={longPressMs}
				maxPointers={1}
				shouldCancelWhenOutside={false}
				onGestureEvent={onGestureEvent}
				onHandlerStateChange={onHandlerStateChange}
			>
				<Animated.View ref={anchor} collapsable={false} style={style}>
					{properties.children}
				</Animated.View>
			</PanGestureHandler>
		)
	}

	return { DragTarget, usePreview }
}

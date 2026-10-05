import { findByProps } from "./index";
import { Stores } from "@revenge-mod/discord/flux";
import { useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";

import type * as t from "./types";

export function createDragMotion({ Gesture, GestureDetector }: t.NativeGestureModule, longPressMs: number) {
    const Reanimated: t.NativeAnimations = findByProps("useSharedValue", "useAnimatedStyle", "withTiming") as t.NativeAnimations;
    const { useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS, cancelAnimation } = Reanimated;
    const { timingStandard }: { timingStandard: Parameters<typeof withTiming>[1] } = findByProps("timingStandard", "timingFast");
    const { SUBTLE_SPRING: subtleSpring }: { SUBTLE_SPRING: t.MotionSpring } = findByProps("SUBTLE_SPRING", "springStandard");
    const View = Reanimated.default.View;
    const panels: t.DiscordPanelsConfig = findByProps("DEFAULT_PANELS_ANIMATION_CONFIG", "ANDROID_PANELS_ANIMATION_CONFIG", "isTimingConfig");
    const panel = Platform.OS === "android" ? panels.ANDROID_PANELS_ANIMATION_CONFIG : panels.DEFAULT_PANELS_ANIMATION_CONFIG;
    const accessibility: t.DrawerAccessibilityStore = Stores.AccessibilityStore as unknown as t.DrawerAccessibilityStore;

    if (!View || ![useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS, cancelAnimation].every(value => typeof value === "function") || !timingStandard || !subtleSpring || !panel) {
        throw new Error("ServerDrawer: native drag animations are unavailable");
    }

    function usePageMotion(view: t.DrawerView, width: number, enabled: boolean, onView: (view: t.DrawerView) => void) {
        const x = useSharedValue(view === "servers" ? 0 : -width);
        const origin = useSharedValue(0);
        const active = useSharedValue(false);
        const callback = useRef(onView);
        callback.current = onView;
        const commit = useMemo(() => (next: t.DrawerView) => callback.current(next), []);
        const reducedMotion = accessibility.useReducedMotion;
        const { touchSlopForPanGesture: slop, minFlingVelocityX: flingVelocity } = panel;
        const style = useAnimatedStyle(() => {
            "worklet";
            return { transform: [{ translateX: x.value }] };
        });
        const gesture = useMemo(() => {
            const settle = (target: number, velocity = 0) => {
                "worklet";
                const next = target === 0 ? "servers" : "dms";
                cancelAnimation(x);
                if (reducedMotion) {
                    x.value = target;
                    runOnJS(commit)(next);
                } else {
                    x.value = withSpring(target, { ...subtleSpring, velocity }, finished => {
                        if (finished) runOnJS(commit)(next);
                    });
                }
            };

            return Gesture.Pan().enabled(enabled).activeOffsetX([-slop, slop]).failOffsetY([-slop, slop])
                .onStart(() => {
                    "worklet";
                    active.value = true;
                    cancelAnimation(x);
                    origin.value = Math.max(-width, Math.min(0, x.value));
                })
                .onUpdate(event => {
                    "worklet";
                    x.value = Math.max(-width, Math.min(0, origin.value + event.translationX));
                })
                .onEnd((event, success) => {
                    "worklet";
                    if (!success) return;
                    const dms = Math.abs(event.velocityX) > flingVelocity ? event.velocityX < 0 : x.value <= -width / 2;
                    settle(dms ? -width : 0, event.velocityX);
                })
                .onFinalize((_event, success) => {
                    "worklet";
                    if (active.value && !success) settle(x.value <= -width / 2 ? -width : 0);
                    active.value = false;
                });
        }, [enabled, width, slop, flingVelocity, reducedMotion, x, origin, active, commit]);

        useEffect(() => {
            cancelAnimation(x);
            x.value = reducedMotion || !enabled ? view === "servers" ? 0 : -width
                : withSpring(view === "servers" ? 0 : -width, subtleSpring);
        }, [view, width]);

        return { gesture, style };
    }

    function usePreview(width: number, grid: boolean) {
        const x = useSharedValue(0);
        const y = useSharedValue(0);
        const scale = useSharedValue(1);
        const style = useAnimatedStyle(() => {
            "worklet";
            return { transform: [{ translateX: grid ? x.value - width / 2 : 0 },
                { translateY: y.value - (grid ? 48 : 41) }, { scale: scale.value }] };
        });

        return { x, y, scale, style };
    }

    function DragTarget(properties: t.DragTargetProps) {
        const callbacks = useRef(properties);
        callbacks.current = properties;
        const { x, y, scale } = properties.preview;
        const offsetX = useSharedValue(0);
        const offsetY = useSharedValue(0);
        const style = useAnimatedStyle(() => {
            "worklet";
            return { transform: [{ translateX: offsetX.value }, { translateY: offsetY.value }] };
        });

        useEffect(() => {
            offsetX.value = withTiming(properties.offset?.x ?? 0, timingStandard);
            offsetY.value = withTiming(properties.offset?.y ?? 0, timingStandard);
        }, [properties.offset?.x, properties.offset?.y]);

        const handlers = useMemo(() => ({
            start: (point: t.DragPoint) => callbacks.current.onStart(point),
            move: (point: t.DragPoint) => callbacks.current.onMove(point),
            drop: (point: t.DragPoint) => callbacks.current.onDrop(point),
            cancel: () => callbacks.current.onCancel(),
        }), []);
        const { start, move, drop, cancel } = handlers;
        const gesture = useMemo(() => Gesture.Pan().activateAfterLongPress(longPressMs).shouldCancelWhenOutside(false)
            .onStart(event => {
                "worklet";
                x.value = event.absoluteX;
                y.value = event.absoluteY;
                scale.value = withTiming(1.05, timingStandard);
                runOnJS(start)({ x: event.absoluteX, y: event.absoluteY });
            })
            .onUpdate(event => {
                "worklet";
                // The preview follows the finger on the UI thread, independently of React and store dispatches.
                x.value = event.absoluteX;
                y.value = event.absoluteY;
                runOnJS(move)({ x: event.absoluteX, y: event.absoluteY });
            })
            .onEnd((event, success) => {
                "worklet";
                if (success) runOnJS(drop)({ x: event.absoluteX, y: event.absoluteY });
            })
            .onFinalize((_event, success) => {
                "worklet";
                scale.value = 1;
                if (!success) runOnJS(cancel)();
            }), [x, y, scale, start, move, drop, cancel]);

        return <GestureDetector gesture={gesture}><View collapsable={false} style={style}>{properties.children}</View></GestureDetector>;
    }

    return { DragTarget, DragPreview: View, PageView: View, usePreview, usePageMotion };
}

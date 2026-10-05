import { findByProps } from "./index";
import { Stores } from "@revenge-mod/discord/flux";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, Pressable } from "react-native";

import type * as t from "./types";

export function createDrawerMotion(Gesture: t.NativeGestureModule["Gesture"]) {
    const panels: t.DiscordPanelsConfig = findByProps("DEFAULT_PANELS_ANIMATION_CONFIG", "ANDROID_PANELS_ANIMATION_CONFIG", "isTimingConfig");
    const { SUBTLE_SPRING: subtleSpring }: { SUBTLE_SPRING: t.MotionSpring } = findByProps("SUBTLE_SPRING", "springStandard");
    const accessibility: t.DrawerAccessibilityStore = Stores.AccessibilityStore as unknown as t.DrawerAccessibilityStore;
    const config = Platform.OS === "android" ? panels.ANDROID_PANELS_ANIMATION_CONFIG : panels.DEFAULT_PANELS_ANIMATION_CONFIG;

    if (!subtleSpring || !config || typeof panels.isTimingConfig !== "function" || typeof Gesture?.Pan !== "function"
        || typeof accessibility?.useReducedMotion !== "boolean") {
        throw new Error("ServerDrawer: native panel animations are unavailable");
    }

    const animate = (value: Animated.Value, next: number, open: boolean, complete?: Animated.EndCallback) => {
        const animation = open ? config.nonSwipeSidePanelOpen : config.nonSwipeSidePanelClose;

        if (accessibility.useReducedMotion) {
            value.stopAnimation();
            value.setValue(next);
            complete?.({ finished: true });
            return;
        }

        if (panels.isTimingConfig(animation)) {
            const easing = typeof animation.easing === "object" ? animation.easing.factory() : animation.easing;
            Animated.timing(value, { ...animation, easing, toValue: next, useNativeDriver: true }).start(complete);
        } else {
            Animated.spring(value, { ...animation, toValue: next, useNativeDriver: true }).start(complete);
        }
    };

    function useDrawerMotion(expanded: boolean, minimum: number, maximum: number, listAtTop: boolean,
        dragging: boolean, onOpen: (open: boolean) => void) {
        const distance = maximum - minimum;
        const [translate] = useState(() => new Animated.Value(expanded ? 0 : distance));
        const position = useRef(expanded ? 0 : distance);
        const target = useRef(position.current);
        const origin = useRef(0);
        const callbacks = useRef({ onOpen });
        callbacks.current = { onOpen };

        const settle = (open: boolean, velocity = 0) => {
            target.current = open ? 0 : distance;
            translate.stopAnimation();
            if (accessibility.useReducedMotion) {
                translate.setValue(target.current);
            } else {
                Animated.spring(translate, { ...subtleSpring, velocity, toValue: target.current, useNativeDriver: true }).start();
            }
        };

        useEffect(() => {
            const listener = translate.addListener(({ value }) => { position.current = value; });

            return () => { translate.stopAnimation(); translate.removeListener(listener); };
        }, [translate]);

        useEffect(() => {
            if (target.current !== (expanded ? 0 : distance)) settle(expanded);
        }, [expanded, distance]);

        const gestures = useMemo(() => {
            const configure = () => {
                let active = false;

                return Gesture.Pan().runOnJS(true).shouldCancelWhenOutside(false)
                    .enabled(!dragging && (!expanded || listAtTop))
                    .activeOffsetY(expanded ? config.touchSlopForPanGesture : -config.touchSlopForPanGesture)
                    .failOffsetY(expanded ? -config.touchSlopForPanGesture : config.touchSlopForPanGesture)
                    .failOffsetX([-config.touchSlopForPanGesture, config.touchSlopForPanGesture])
                    .onStart(event => {
                        active = true;
                        translate.stopAnimation();
                        origin.current = Math.max(0, Math.min(distance, position.current)) - event.translationY;
                    })
                    .onUpdate(event => {
                        position.current = Math.max(0, Math.min(distance, origin.current + event.translationY));
                        translate.setValue(position.current);
                    })
                    .onEnd((event, success) => {
                        if (!success) return;
                        const fling = Math.abs(event.velocityY) > config.minFlingVelocityX;
                        const open = fling ? event.velocityY < 0 : position.current < distance / 2;
                        settle(open, event.velocityY);
                        callbacks.current.onOpen(open);
                    })
                    .onFinalize((_event, success) => {
                        if (active && !success) settle(target.current === 0);
                        active = false;
                    });
            };

            return { gesture: configure(), overlayGesture: configure() };
        }, [expanded, distance, listAtTop, dragging]);

        return { ...gestures, panelStyle: { transform: [{ translateY: translate }] },
            compactStyle: { opacity: translate.interpolate({ inputRange: [0, distance], outputRange: [0, 1], extrapolate: "clamp" }) },
            expandedStyle: { opacity: translate.interpolate({ inputRange: [0, distance], outputRange: [1, 0], extrapolate: "clamp" }) } };
    }

    function useFolderPageMotion(folderId: string | undefined) {
        const [progress] = useState(() => new Animated.Value(1));
        const previous = useRef(folderId);

        useEffect(() => {
            if (previous.current === folderId) return;
            previous.current = folderId;
            progress.setValue(0);
            animate(progress, 1, !!folderId);

            return () => progress.stopAnimation();
        }, [folderId]);

        return { opacity: progress, transform: [{ translateY: progress.interpolate({
            inputRange: [0, 1], outputRange: [folderId ? 24 : -24, 0], extrapolate: "clamp"
        }) }] };
    }

    function useFolderOverlayMotion(folderId: string | undefined) {
        const [retainedId, setRetainedId] = useState(folderId);
        const [progress] = useState(() => new Animated.Value(0));

        useEffect(() => {
            let cancelled = false;
            if (folderId) setRetainedId(folderId);
            animate(progress, folderId ? 1 : 0, !!folderId, ({ finished }) => {
                if (finished && !cancelled && !folderId) setRetainedId(undefined);
            });

            return () => { cancelled = true; progress.stopAnimation(); };
        }, [folderId]);

        return { folderId: folderId ?? retainedId, backdropStyle: { opacity: progress },
            panelStyle: { transform: [{ translateY: progress.interpolate({
                inputRange: [0, 1], outputRange: [24, 0], extrapolate: "clamp"
            }) }] } };
    }

    return { AnimatedView: Animated.View, AnimatedPressable: Animated.createAnimatedComponent(Pressable),
        useDrawerMotion, useFolderPageMotion, useFolderOverlayMotion };
}

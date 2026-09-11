import { lookupGeneratedIconComponent } from "@revenge-mod/utils/discord";
import { after } from "@revenge-mod/patcher";
import { ReactJSXRuntime } from "@revenge-mod/react";
import * as Runtime from "@revenge-mod/react";
import { findByProps } from "./metro";
import { createController } from "./controller";
import { replaceReactElementType, transformLeftPanelContent } from "./layout";
import { createGuildMenu } from "./menu";
import { createPreferences } from "./storage";
import { initializeTheme } from "./theme";
import { createServerDrawerSurface } from "./surface";
import { computeGuildDockSpecs } from "./model";
import React from "react";
import * as Native from "react-native";
let dispose: (() => void) | undefined;
export default plugin({
    async start({ cleanup }) {
        dispose?.();
        let stopped = false;
        let stopCurrent = () => { stopped = true; };
        cleanup(() => stopCurrent());
        const preferences = await createPreferences();
        if (stopped) return;
        let abort: AbortController | undefined;
        let DrawerSurface: React.ComponentType<any>;
        let useInset: () => number;
        const initialize = () => {
            const inset = findByProps("useYouBarTotalHeight");
            if (typeof inset?.useYouBarTotalHeight !== "function") return false;
            initializeTheme();
            const controller = createController();
            const ChatIcon = lookupGeneratedIconComponent("ChatIcon");
            if (typeof ChatIcon !== "function") throw new Error("ServerDrawer: native DM icon is unavailable");
            abort = new AbortController();
            const Surface = createServerDrawerSurface({
                react: Runtime.React,
                reactNative: Runtime.ReactNative,
                components: { TextInput: Native.TextInput, ChatIcon },
                modules: { findByProps },
                useGuildMenu: createGuildMenu(),
            }, controller, preferences, abort.signal);
            if (!Surface) throw new Error("ServerDrawer: native surface components are unavailable");
            useInset = inset.useYouBarTotalHeight;
            DrawerSurface = Surface;
            return true;
        };
        const wrappers = new WeakMap<(props: any) => any, React.ComponentType<any>>();
        const listeners = new Set<() => void>();
        let active = true;
        let initializationError: string | undefined;
        function DockLayout({ rendered }: { rendered: any }) {
            const height = useInset();
            const bottomInset = Math.max(0, Number.isFinite(height) ? height : 0);
            const dimensions = Native.useWindowDimensions();
            const [width, setWidth] = React.useState(dimensions.width);
            return transformLeftPanelContent(rendered, <DrawerSurface key="rain-server-drawer" bottomInset={bottomInset} onWidthChange={setWidth} />,
                bottomInset + computeGuildDockSpecs(Math.max(80, width - 16)).dockHeight - 6,
                rail => <Native.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none"
                    style={{ height: 1, width: 1, position: "absolute", left: -10000, opacity: 0 }}>
                    {rail as any}
                </Native.View>) as any ?? rendered;
        }
        function YouBarBackdrop({ component, properties }: { component: any; properties: any }) {
            const height = useInset();
            return <Native.View pointerEvents="none" style={{ position: "absolute", bottom: 0, left: 0, right: 0,
                height: Math.max(0, Number.isFinite(height) ? height : 0), overflow: "hidden" }}>
                {React.createElement(component, properties)}
            </Native.View>;
        }
        const shadeWrappers = new WeakMap<object, React.ComponentType<any>>();
        const onShade = (Original: any, element: any) => {
            const target = typeof Original === "function" ? Original : Original?.type ?? Original?.render;
            if (typeof target !== "function") return element;
            let Wrapper = shadeWrappers.get(Original);
            if (!Wrapper) {
                Wrapper = function ServerDrawerYouBarShade(props: any) {
                    const [, refresh] = React.useReducer(value => value + 1, 0);
                    React.useEffect(() => {
                        listeners.add(refresh);
                        return () => { listeners.delete(refresh); };
                    }, []);
                    return active && DrawerSurface ? <YouBarBackdrop component={Original} properties={props} /> : React.createElement(Original, props);
                };
                shadeWrappers.set(Original, Wrapper);
            }
            return replaceReactElementType(element, Wrapper) ?? element;
        };
        // LeftPanelContent is a private, unexported function; intercept its named JSX creation.
        const onPanel = (Original: any, element: any) => {
            if (typeof Original !== "function" || Original.prototype?.isReactComponent || element.type !== Original) return element;
            let Wrapper = wrappers.get(Original);
            if (!Wrapper) {
                Wrapper = function ServerDrawerLeftPanel(props: any) {
                    const rendered = Original(props);
                    const [, refresh] = React.useReducer(value => value + 1, 0);
                    React.useEffect(() => {
                        listeners.add(refresh);
                        return () => { listeners.delete(refresh); };
                    }, []);
                    React.useEffect(() => {
                        if (!active || DrawerSurface) return;
                        const tryInitialize = () => {
                            if (!active || DrawerSurface) return true;
                            try {
                                if (!initialize()) return false;
                                listeners.forEach(notify => notify());
                                return true;
                            } catch (error) {
                                const message = String(error);
                                if (message !== initializationError) console.error(`[ServerDrawer] ${message}`);
                                initializationError = message;
                                return false;
                            }
                        };
                        if (tryInitialize()) return;
                        const timer = setInterval(() => { if (tryInitialize()) clearInterval(timer); }, 250);
                        return () => clearInterval(timer);
                    }, []);
                    return active && DrawerSurface ? <DockLayout rendered={rendered} /> : rendered;
                };
                wrappers.set(Original, Wrapper);
            }
            return replaceReactElementType(element, Wrapper) as any ?? element;
        };
        for (const key of ["jsx", "jsxs"] as const) {
            if (typeof ReactJSXRuntime[key] !== "function") throw new Error(`ServerDrawer: JSX runtime ${key} is unavailable`);
        }
        const unpatches: (() => unknown)[] = [];
        dispose = stopCurrent = () => {
            active = false;
            unpatches.splice(0).reverse().forEach(unpatch => unpatch());
            abort?.abort();
            listeners.forEach(refresh => refresh());
            listeners.clear();
            dispose = undefined;
        };
        try {
            for (const key of ["jsx", "jsxs"] as const) {
                unpatches.push(after(ReactJSXRuntime, key, element => {
                    const Original: any = element?.type;
                    const name = Original?.displayName ?? Original?.name ?? Original?.type?.name ?? Original?.render?.name;
                    if (name === "YouBarFloatingShade") return onShade(Original, element);
                    return typeof Original === "function" && Original.name === "LeftPanelContent" ? onPanel(Original, element) : element;
                }));
            }
        } catch (error) { dispose?.(); throw error; }
    },
    stop() { dispose?.(); },
});

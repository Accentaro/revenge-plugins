import { after } from "@revenge-mod/patcher";
import { ReactJSXRuntime } from "@revenge-mod/react";
import { withStoreName } from "@revenge-mod/discord/flux";
import { lookupModule, lookupModules } from "@revenge-mod/modules/finders";
import { withDependencies, withName, withProps } from "@revenge-mod/modules/finders/filters";
import { getJsonStorage, pluginStoragePathFor } from "@revenge-mod/json-storage";
import React from "react";
import * as Native from "react-native";
import { createServerDrawerSurface } from "./surface";
import type * as t from "./types";

function findModule<T extends object>(filter: ReturnType<typeof withProps<T>>) {
    const found = lookupModule(filter, { cached: false })[0];
    if (found) return found;
    for (const [, id] of lookupModules(withStoreName("SortedGuildStore").or(withStoreName("GuildStore")).or(withStoreName("UserSettingsProtoStore")), { cached: false })) {
        const dependency = withDependencies.unordered([id]);
        for (const pattern of [dependency, withDependencies.unordered([dependency])]) {
            const result = lookupModule(withDependencies(pattern).and(filter), { cached: false })[0];
            if (result) return result;
        }
    }
    throw new Error(`ServerDrawer: native module unavailable (${filter.key})`);
}

export function findByProps<K extends keyof t.NativeExports>(first: K, ...props: K[]) {
    return findModule(withProps<Pick<t.NativeExports, K>>(first, ...props));
}

export function findByName<K extends keyof t.NativeExports>(name: K) {
    return findModule(withName<t.NativeExports[K] & object>(name));
}

export const preferences = getJsonStorage<t.ServerDrawerPreferences>(pluginStoragePathFor("dev.rain.serverdrawer"), { default: { dmOrder: [], layout: "grid" } });

export function reportActionFailure(operation: string, error: unknown): void {
    console.error(`[ServerDrawer] ${operation} failed`, error);
    Native.ToastAndroid.show(`Could not ${operation}. Please try again.`, Native.ToastAndroid.LONG);
}

export default plugin({
    start({ cleanup }) {
        const abort = new AbortController();
        cleanup(() => abort.abort());
        const loaded = preferences.get();

        let DrawerSurface: React.ComponentType<t.ServerDrawerSurfaceProps>;
        let useInset: () => number;

        const useActive = () => React.useSyncExternalStore(listener => {
            abort.signal.addEventListener("abort", listener);

            return () => abort.signal.removeEventListener("abort", listener);
        }, () => !abort.signal.aborted);

        function YouBarBackdrop({ element }: t.ElementProps) {
            const height = useInset();
            const active = useActive();

            return active ? <Native.View pointerEvents="none" style={{ position: "absolute", bottom: 0, left: 0, right: 0, height, overflow: "hidden" }}>{element}</Native.View> : element;
        }

        function ServerDrawerLeftPanel({ element }: t.ElementProps) {
            const rendered = (element.type as t.PanelComponent)(element.props);
            const active = useActive();
            const [ready, setReady] = React.useState(!!DrawerSurface);

            React.useEffect(() => {
                loaded.then(() => {
                    if (abort.signal.aborted) return;
                    if (!DrawerSurface) {
                        const inset = findByProps("useYouBarTotalHeight");
                        const width = lookupModule(withName<() => number>("useChannelListWidth"), { returnNamespace: true, cached: false })[0];
                        const { DM_WIDTH } = findByProps("DM_WIDTH");
                        if (typeof inset?.useYouBarTotalHeight !== "function" || !width || !("default" in width) || typeof width.default !== "function" || !Number.isFinite(DM_WIDTH)) throw new Error("Native panel layout is unavailable");
                        useInset = () => {
                            const height = inset.useYouBarTotalHeight();
                            return Math.max(0, Number.isFinite(height) ? height : 0);
                        };
                        DrawerSurface = createServerDrawerSurface(abort.signal, useInset);
                        cleanup(after(width, "default", (value: number) => value + DM_WIDTH));
                    }
                    setReady(true);
                }).catch(error => console.error("[ServerDrawer] Initialization failed", error));
            }, []);

            return active && ready ? <DrawerSurface panel={rendered} /> : rendered;
        }

        for (const key of ["jsx", "jsxs"] as const) cleanup(after(ReactJSXRuntime, key, result => {
            const element = result as t.PanelElement;
            const type = element?.type as React.MemoExoticComponent<React.ComponentType>;
            if (DrawerSurface && type?.type?.name === "YouBarFloatingShade") return <YouBarBackdrop element={element} />;

            return typeof element?.type === "function" && element.type.name === "LeftPanelContent"
                ? <ServerDrawerLeftPanel key={element.key} element={element} /> : element;
        }));
    },
});

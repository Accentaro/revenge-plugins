import { Design } from "@revenge-mod/discord/design";
import { findByNameUsingStore, findByProps, findByPropsInDependencies, findByStoreName } from "./metro";
import { reportActionFailure } from "./errors";
import { positionGuildMenu } from "./menuPosition";
import { useEffect, useRef } from "react";
import { Dimensions } from "react-native";
interface MenuItem { action(): unknown; label: string }
interface MenuState { activeIndex: { get(): number; set(value: number): void } }
export function createGuildMenu() {
    const GuildStore = findByStoreName("GuildStore");
    const menu = findByProps("showContextMenu", "hideContextMenu", "useContextMenuState");
    const ContextMenu = Design.ContextMenu;
    if (typeof ContextMenu !== "function") throw new Error("ServerDrawer: native context menu component is unavailable");
    const sizing = findByPropsInDependencies(["ContextMenu"], "CONTEXT_MENU_MIN_WIDTH", "CONTEXT_MENU_EDGE_OFFSET");
    if (!Number.isFinite(sizing?.CONTEXT_MENU_MIN_WIDTH) || !Number.isFinite(sizing?.CONTEXT_MENU_EDGE_OFFSET)) {
        throw new Error("ServerDrawer: native menu sizing is unavailable");
    }
    const getItems = findByNameUsingStore("GuildStore", "getGuildsBarGuildMenuItems");
    const sortedGuilds = findByStoreName("SortedGuildStore");
    for (const method of ["showContextMenu", "hideContextMenu", "useContextMenuState"]) {
        if (typeof menu?.[method] !== "function") throw new Error(`ServerDrawer: native menu ${method} is unavailable`);
    }
    if (typeof getItems !== "function" || typeof menu.ContextMenuStore?.getState !== "function"
        || typeof sortedGuilds?.getGuildsTree !== "function" || typeof GuildStore?.getGuild !== "function") {
        throw new Error("ServerDrawer: native guild menu is unavailable");
    }
    return function useGuildMenu(signal: AbortSignal) {
        const state: MenuState = menu.useContextMenuState();
        const ownedKey = useRef<string | undefined>(undefined);
        useEffect(() => {
            const close = () => {
                if (ownedKey.current && menu.ContextMenuStore.getState().menu?.key === ownedKey.current) menu.hideContextMenu();
                ownedKey.current = undefined;
            };
            signal.addEventListener("abort", close);
            return () => { signal.removeEventListener("abort", close); close(); };
        }, [signal]);
        return (id: string, x: number, y: number): void => {
            if (signal.aborted) return;
            try {
                const guild = GuildStore.getGuild(id);
                if (!guild) throw new Error("Server is no longer available");
                const items: MenuItem[] = getItems(id, sortedGuilds.getGuildsTree().version);
                if (!Array.isArray(items) || !items.length || items.some(item => typeof item.action !== "function")) {
                    throw new Error("Native guild menu returned no usable actions");
                }
                const key = `rain-serverdrawer:${id}`;
                state.activeIndex.set(-1);
                ownedKey.current = key;
                menu.showContextMenu({
                    key, title: guild.name, items,
                    ...positionGuildMenu(x, y, Dimensions.get("window"), sizing.CONTEXT_MENU_MIN_WIDTH, sizing.CONTEXT_MENU_EDGE_OFFSET),
                    state, dividerIndexes: [], keyboardShouldPersistTaps: "never",
                    requestClose(cancelled: boolean) {
                        const selected = state.activeIndex.get();
                        state.activeIndex.set(-1);
                        if (menu.ContextMenuStore.getState().menu?.key === key) menu.hideContextMenu();
                        ownedKey.current = undefined;
                        if (!cancelled && items[selected]) {
                            try { Promise.resolve(items[selected].action()).catch(error => reportActionFailure("complete this server action", error)); }
                            catch (error) { reportActionFailure("complete this server action", error); }
                        }
                    },
                    onClose() { ownedKey.current = undefined; },
                });
            } catch (error) { reportActionFailure("open the server menu", error); }
        };
    };
}

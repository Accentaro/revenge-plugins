import { showToast } from "./toasts";
import { findByName, findByProps, findByPropsUsingStore, findByStoreName } from "./metro";
import { Stores } from "@revenge-mod/discord/flux";
import type { ServerDrawerController } from "./surface";
import { BackHandler, LayoutAnimation } from "react-native";
import * as Native from "react-native";
export function createController(): ServerDrawerController {
    const { ChannelStore, GuildStore, SelectedChannelStore, SelectedGuildStore, UserStore } = Stores;
    const stores: Record<string, any> = {
        ChannelStore, GuildStore, SelectedChannelStore, SelectedGuildStore, UserStore,
        PrivateChannelSortStore: findByStoreName("PrivateChannelSortStore"),
        ReadStateStore: findByStoreName("ReadStateStore"),
        SortedGuildStore: findByStoreName("SortedGuildStore"),
        GuildReadStateStore: findByStoreName("GuildReadStateStore"),
    };
    const requiredMethods: Record<string, string[]> = {
        ChannelStore: ["getChannel"],
        GuildStore: ["getGuild"],
        SelectedChannelStore: ["getChannelId"],
        SelectedGuildStore: ["getGuildId"],
        UserStore: ["getUser"],
        PrivateChannelSortStore: ["getPrivateChannelIds"],
        ReadStateStore: ["getMentionCount", "hasUnread"],
        SortedGuildStore: ["getGuildsTree", "getGuildFolders", "getGuildFolderById"],
        GuildReadStateStore: ["getMentionCount", "hasUnread"],
    };
    for (const [name, methods] of Object.entries(requiredMethods)) {
        for (const method of [...methods, "addChangeListener", "removeChangeListener"]) {
            if (typeof stores[name]?.[method] !== "function") throw new Error(`ServerDrawer: ${name}.${method} is unavailable`);
        }
    }
    const actions = findByPropsUsingStore("SortedGuildStore", "moveById", "createGuildFolderLocal", "editGuildFolderLocal");
    const folderSettings = findByPropsUsingStore("SortedGuildStore", "saveGuildFolders");
    const guildNavigation = findByProps("transitionToGuild");
    const channelNavigation = findByPropsUsingStore("ChannelStore", "transitionToChannel");
    const guildBarNavigation = findByName("transitionGuildsBarToGuildOrOpenSelectedChannel");
    for (const name of ["moveById", "createGuildFolderLocal", "editGuildFolderLocal"]) {
        if (typeof actions?.[name] !== "function") throw new Error(`ServerDrawer: ${name} is unavailable`);
    }
    if (typeof guildNavigation?.transitionToGuild !== "function" || typeof channelNavigation?.transitionToChannel !== "function") {
        throw new Error("ServerDrawer: native navigation is unavailable");
    }
    if (typeof folderSettings?.saveGuildFolders !== "function" || typeof stores.SortedGuildStore.getGuildFolders !== "function") {
        throw new Error("ServerDrawer: account folder persistence is unavailable");
    }
    const reportSaveFailure = (error: unknown) => {
        console.error("[ServerDrawer] Failed to save account folders", error);
        showToast("Folder changes could not sync to your account. Please try again.");
    };
    const persistFolders = () => {
        try {
            // Local actions update the tree; the native saver queues the account settings update.
            const folders = stores.SortedGuildStore.getGuildFolders().map((entry: any) => ({ ...entry, guildIds: [...entry.guildIds] }));
            Promise.resolve(folderSettings.saveGuildFolders(folders)).catch(reportSaveFailure);
        } catch (error) { reportSaveFailure(error); }
    };
    const tree = () => stores.SortedGuildStore.getGuildsTree();
    const folder = (id: string) => tree()?.root?.children?.find((node: any) => node.type === "folder" && String(node.id) === id);
    const guildExists = (id: string) => !!stores.GuildStore.getGuild(id);
    const read = (store: any, id: string) => ({ mentions: store?.getMentionCount?.(id) ?? 0, unread: store?.hasUnread?.(id) ?? false });
    return {
        FlatList: Native.FlatList,
        snapshot() {
            const rawTree = tree();
            const privateChannels = (stores.PrivateChannelSortStore?.getPrivateChannelIds?.() ?? []).flatMap((id: string) => {
                const channel = stores.ChannelStore.getChannel(id);
                if (!channel || (channel.type !== 1 && channel.type !== 3)) return [];
                const users = (channel.recipients ?? []).map((recipient: string) => stores.UserStore.getUser(recipient)).filter(Boolean);
                const avatarUri = channel.type === 1 ? users[0]?.getAvatarURL?.(undefined, 128, true)
                    : channel.icon ? `https://cdn.discordapp.com/channel-icons/${id}/${channel.icon}.webp?size=128` : undefined;
                return [{ id, avatarUri, name: channel.name || users.map((user: any) => user.globalName || user.username).join(", ") || "Direct Message" }];
            });
            const selectedChannelId = stores.SelectedChannelStore?.getChannelId?.();
            return {
                tree: { root: { ...rawTree?.root, children: rawTree?.root?.children?.map((node: any) => {
                    if (node.type !== "folder") return node;
                    const metadata = stores.SortedGuildStore.getGuildFolderById(node.id);
                    return { ...node, name: metadata?.folderName ?? node.name, color: metadata?.folderColor ?? node.color };
                }) } },
                selectedGuildId: stores.SelectedGuildStore?.getGuildId?.(),
                selectedPrivateChannelId: privateChannels.some((channel: any) => channel.id === selectedChannelId) ? selectedChannelId : undefined,
                privateChannels,
            };
        },
        resolveGuild: id => stores.GuildStore.getGuild(id),
        readState: id => read(stores.GuildReadStateStore, id),
        readPrivateChannelState: id => read(stores.ReadStateStore, id),
        subscribe(listener) {
            const attached: typeof stores[string][] = [];
            const detach = () => {
                for (const store of attached.splice(0).reverse()) {
                    try { store.removeChangeListener(listener); }
                    catch (error) { console.error("[ServerDrawer] Store cleanup failed", error); }
                }
            };
            try {
                for (const store of Object.values(stores)) {
                    store.addChangeListener(listener);
                    attached.push(store);
                }
            } catch (error) { detach(); throw error; }
            return detach;
        },
        selectGuild(id) {
            if (!guildExists(id)) return false;
            if (typeof guildBarNavigation === "function") guildBarNavigation(id);
            else guildNavigation.transitionToGuild(id);
            return true;
        },
        selectPrivateChannel(id) {
            if (!stores.ChannelStore.getChannel(id)) return false;
            channelNavigation.transitionToChannel(id, {});
            return true;
        },
        moveGuild(sourceId, targetId) {
            if (sourceId === targetId) return false;
            const sourceFolder = folder(sourceId);
            const targetFolder = folder(targetId);
            if (!sourceFolder && !guildExists(sourceId) || !targetFolder && !guildExists(targetId)) return false;
            actions.moveById(sourceFolder?.id ?? sourceId, targetFolder?.id ?? targetId);
            persistFolders();
            return true;
        },
        dropGuild(sourceId, targetId) {
            if (sourceId === targetId || !guildExists(sourceId)) return false;
            const targetFolder = folder(targetId);
            if (targetFolder) {
                if (targetFolder.children.some((child: any) => child.id === sourceId)) return false;
                actions.editGuildFolderLocal(targetFolder.id, [...targetFolder.children.map((child: any) => child.id), sourceId], targetFolder.name);
            } else {
                if (!guildExists(targetId)) return false;
                actions.createGuildFolderLocal([targetId, sourceId], undefined);
            }
            persistFolders();
            return true;
        },
        removeGuildFromFolder(sourceId, folderId) {
            const current = folder(folderId);
            if (!current?.children.some((child: any) => child.id === sourceId)) return false;
            const remaining = current.children.filter((child: any) => child.id !== sourceId).map((child: any) => child.id);
            // Discord moves omitted members beside the folder instead of leaving the server.
            actions.editGuildFolderLocal(current.id, remaining, current.name);
            persistFolders();
            return true;
        },
        renameFolder(id, name) {
            const current = folder(id);
            if (!current) return false;
            actions.editGuildFolderLocal(current.id, current.children.map((child: any) => child.id), name.trim());
            persistFolders();
            return true;
        },
        openCreateGuild() {
            const create = findByProps("openCreateGuildModal");
            if (typeof create?.openCreateGuildModal !== "function") return false;
            create.openCreateGuildModal();
            return true;
        },
        openCreateDm() {
            const holder = findByProps("getRootNavigationRef")?.getRootNavigationRef?.();
            const navigation = holder?.current ?? holder;
            if (typeof navigation?.dispatch !== "function") return false;
            const findDestination = (state: any): { name: string; target: string } | undefined => {
                const name = state?.routeNames?.find((route: string) => route.replace(/[^a-z]/gi, "").toLowerCase() === "newmessage");
                if (name) return { name, target: state.key };
                for (const route of state?.routes ?? []) {
                    const found = findDestination(route.state);
                    if (found) return found;
                }
            };
            const state = navigation.getRootState?.() ?? navigation.getState?.();
            const destination = findDestination(state);
            if (!destination) {
                if (!state?.routeNames?.includes("friends") || typeof navigation.navigate !== "function") return false;
                // Discord mounts the message composer inside the friends navigator on first use.
                navigation.navigate("friends", { screen: "new-message", params: { sourcePage: "NEW_MESSAGE_COMPOSER" } });
                return true;
            }
            navigation.dispatch({ type: "NAVIGATE", target: destination.target, payload: { name: destination.name, params: { sourcePage: "NEW_MESSAGE_COMPOSER" } } });
            return true;
        },
        addBackHandler(listener) {
            const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
                const navigationModule = findByProps("getRootNavigationRef");
                if (typeof navigationModule?.getRootNavigationRef !== "function") return false;
                const holder = navigationModule.getRootNavigationRef();
                const navigation = holder?.current ?? holder;
                // The panel remains mounted behind channel, settings, and modal routes.
                if (typeof navigation?.getCurrentRoute !== "function" || navigation.getCurrentRoute()?.name !== "guilds") return false;
                return listener();
            });
            return () => subscription.remove();
        },
        animateNext: duration => LayoutAnimation.configureNext({ duration: duration ?? 110, update: { type: LayoutAnimation.Types.easeInEaseOut } }),
    };
}

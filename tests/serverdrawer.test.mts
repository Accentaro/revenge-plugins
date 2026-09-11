import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
const copy = (value: unknown) => JSON.parse(JSON.stringify(value));
const calls: any[] = [];
const saves: any[] = [];
const notices: string[] = [];
const logged: unknown[] = [];
let backListener: (() => boolean) | undefined;
const native = { BackHandler: { addEventListener: (_event: string, callback: () => boolean) => { backListener = callback; return { remove() { backListener = undefined; } }; } } };
let accountFolders = [{ folderId: 42, folderName: "Friends", folderColor: 123, guildIds: ["a", "b"] }, { guildIds: ["c"] }];
const folder = { id: 42, type: "folder", name: "Friends", color: 123, children: [{ id: "a", type: "guild" }, { id: "b", type: "guild" }] };
const stores: Record<string, any> = {
    SortedGuildStore: { getGuildFolders: () => accountFolders, getGuildsTree: () => ({ root: { children: [folder, { id: "c", type: "guild" }] } }), getGuildFolderById: () => ({ folderName: folder.name, folderColor: folder.color }) },
    GuildStore: { getGuild: (id: string) => ["a", "b", "c"].includes(id) ? { id, name: id } : undefined },
    ChannelStore: { getChannel: (id: string) => id === "dm" ? { id, type: 1, recipients: ["user"] } : undefined },
    PrivateChannelSortStore: { getPrivateChannelIds: () => ["dm"] },
    UserStore: { getUser: () => ({ username: "friend", getAvatarURL: () => "https://example.com/avatar.png" }) },
    SelectedChannelStore: { getChannelId: () => "dm" },
    SelectedGuildStore: { getGuildId: () => "a" },
    ReadStateStore: { getMentionCount: () => 0, hasUnread: () => false },
    GuildReadStateStore: { getMentionCount: () => 0, hasUnread: () => false },
};
for (const store of Object.values(stores)) {
    store.addChangeListener = () => {};
    store.removeChangeListener = () => {};
}
const actions: Record<string, any> = Object.fromEntries(["moveById", "createGuildFolderLocal", "editGuildFolderLocal", "transitionToGuild", "transitionToChannel"].map(name => [name, (...args: unknown[]) => calls.push([name, ...args])]));
actions.saveGuildFolders = (folders: unknown) => { saves.push(copy(folders)); };
async function load(entry: string): Promise<any> {
    const result = await build({ entryPoints: [entry], bundle: true, write: false, format: "cjs", plugins: [{ name: "host", setup(builder) {
        builder.onResolve({ filter: /^(?:@revenge-mod\/discord\/flux|\.\/metro|\.\/toasts|react-native)$/ }, args => ({ path: args.path, namespace: "host" }));
        builder.onLoad({ filter: /.*/, namespace: "host" }, () => ({ contents: `export const showToast = text => globalThis.notices.push(text); export const findByName = () => undefined; export const findByProps = () => globalThis.actions; export const findByPropsUsingStore = () => globalThis.actions; export const Stores = globalThis.stores; export const findByStoreName = name => globalThis.stores[name]; export const FlatList = () => null; export const BackHandler = globalThis.native.BackHandler; export const logger = { error: (...args) => globalThis.logged.push(args) }; export const { ChannelStore, GuildStore, SelectedChannelStore, SelectedGuildStore, UserStore } = globalThis.stores; export const LayoutAnimation = {};` }));
    } }] });
    const context = { module: { exports: {} }, stores, actions, notices, logged, native, console: { error: (...args: unknown[]) => logged.push(args) } };
    vm.runInNewContext(result.outputFiles[0].text, context);
    return context.module.exports;
}
const { createController } = await load("plugins/serverdrawer/js/controller.ts");
const { parseGuildTree, computeGuildDockSpecs, buildCompactDockItems } = await load("plugins/serverdrawer/js/model.ts");
const controller = createController();
test("rename preserves the complete native folder membership and numeric folder id", () => {
    calls.length = 0;
    assert.equal(controller.renameFolder("42", "  New name  "), true);
    assert.deepEqual(copy(calls), [["editGuildFolderLocal", 42, ["a", "b"], "New name"]]);
});
test("dropping into an existing folder preserves its members and name", () => {
    calls.length = 0;
    assert.equal(controller.dropGuild("c", "42"), true);
    assert.deepEqual(copy(calls), [["editGuildFolderLocal", 42, ["a", "b", "c"], "Friends"]]);
});
test("dropping one server onto another creates a native folder in target-first order", () => {
    calls.length = 0;
    assert.equal(controller.dropGuild("c", "a"), true);
    assert.deepEqual(copy(calls[0].slice(0, 2)), ["createGuildFolderLocal", ["a", "c"]]);
});
test("stale targets, self-drops, and duplicate folder membership cannot mutate native folders", () => {
    calls.length = 0;
    assert.equal(controller.dropGuild("a", "a"), false);
    assert.equal(controller.dropGuild("missing", "a"), false);
    assert.equal(controller.dropGuild("c", "missing"), false);
    assert.equal(controller.dropGuild("a", "42"), false);
    assert.equal(controller.renameFolder("missing", "Name"), false);
    assert.equal(calls.length, 0);
});
test("folder reordering preserves numeric ids and ordinary server reordering stays native", () => {
    calls.length = 0;
    controller.moveGuild("42", "c");
    controller.moveGuild("c", "a");
    assert.deepEqual(copy(calls), [["moveById", 42, "c"], ["moveById", "c", "a"]]);
});
test("snapshots include current DM avatar and native folder name/color", () => {
    const state = controller.snapshot();
    assert.equal(state.selectedPrivateChannelId, "dm");
    assert.equal(state.privateChannels[0].avatarUri, "https://example.com/avatar.png");
    const nodes = parseGuildTree(state.tree, { resolveGuild: controller.resolveGuild });
    assert.equal(nodes[0].name, "Friends");
    assert.equal(nodes[0].color, 123);
    assert.deepEqual(copy(nodes[0].children.map((guild: any) => guild.id)), ["a", "b"]);
});
test("collapsed drawer always separates DMs from servers and always exposes expansion", () => {
    const nodes = parseGuildTree(controller.snapshot().tree, { resolveGuild: controller.resolveGuild });
    for (const width of [320, 360, 454, 768]) {
        const specs = computeGuildDockSpecs(width);
        for (const list of [[], nodes]) {
            const items = buildCompactDockItems(list, specs);
            assert.deepEqual(copy(items.slice(-3).map((item: any) => item.kind)), ["divider", "dm", "overflow"]);
            assert.equal(items.filter((item: any) => item.kind === "dm").length, 1);
        }
    }
});
test("subscriptions are removed on drawer teardown", () => {
    const listeners = new Set();
    stores.GuildStore.addChangeListener = (listener: () => void) => listeners.add(listener);
    stores.GuildStore.removeChangeListener = (listener: () => void) => listeners.delete(listener);
    const stop = controller.subscribe(() => {});
    assert.equal(listeners.size, 1);
    stop();
    assert.equal(listeners.size, 0);
});
test("missing required native action fails before installing the drawer", () => {
    const edit = actions.editGuildFolderLocal;
    actions.editGuildFolderLocal = undefined;
    try { assert.throws(createController, /editGuildFolderLocal is unavailable/); }
    finally { actions.editGuildFolderLocal = edit; }
});
test("new DM opens the registered message composer in its owning navigator", () => {
    calls.length = 0;
    actions.getRootNavigationRef = () => ({ current: {
        getRootState: () => ({ key: "root", routeNames: ["gdm"], routes: [{ state: { key: "messages", routeNames: ["new-message"] } }] }),
        dispatch: (action: unknown) => calls.push(action),
    } });
    assert.equal(controller.openCreateDm(), true);
    assert.deepEqual(copy(calls[0]), { type: "NAVIGATE", target: "messages", payload: { name: "new-message", params: { sourcePage: "NEW_MESSAGE_COMPOSER" } } });
    actions.getRootNavigationRef = undefined;
});
test("new DM initializes the nested composer from a cold guild-screen session", () => {
    calls.length = 0;
    actions.getRootNavigationRef = () => ({
        getRootState: () => ({ key: "root", routeNames: ["main", "friends"], routes: [] }),
        dispatch: () => { throw new Error("Composer navigator is not mounted yet"); },
        navigate: (...args: unknown[]) => calls.push(args),
    });
    assert.equal(controller.openCreateDm(), true);
    assert.deepEqual(copy(calls[0]), ["friends", { screen: "new-message", params: { sourcePage: "NEW_MESSAGE_COMPOSER" } }]);
    actions.getRootNavigationRef = undefined;
});
test("every successful folder mutation persists the complete native layout", () => {
    saves.length = 0;
    controller.renameFolder("42", "Renamed");
    controller.dropGuild("c", "42");
    controller.dropGuild("c", "a");
    controller.moveGuild("42", "c");
    assert.equal(saves.length, 4);
    for (const saved of saves) assert.deepEqual(saved, accountFolders);
});
test("persistence reads the updated layout after the local action", () => {
    const originalAction = actions.createGuildFolderLocal;
    const originalFolders = accountFolders;
    saves.length = 0;
    try {
        actions.createGuildFolderLocal = () => { accountFolders = [{ folderId: 99, folderName: "New", folderColor: 456, guildIds: ["a", "c"] }, { guildIds: ["b"] }]; };
        controller.dropGuild("c", "a");
        assert.deepEqual(saves[0], accountFolders);
        assert.equal(saves[0][0].folderId, 99);
    } finally { actions.createGuildFolderLocal = originalAction; accountFolders = originalFolders; }
});
test("invalid mutations do not submit account settings", () => {
    saves.length = 0;
    controller.dropGuild("a", "a");
    controller.dropGuild("a", "42");
    controller.renameFolder("missing", "Name");
    controller.moveGuild("missing", "a");
    assert.equal(saves.length, 0);
});
test("missing persistence fails validation before any local mutation", () => {
    const save = actions.saveGuildFolders;
    actions.saveGuildFolders = undefined;
    try { assert.throws(createController, /account folder persistence is unavailable/); }
    finally { actions.saveGuildFolders = save; }
});
test("sync and async save failures are reported without unhandled rejections", async () => {
    const save = actions.saveGuildFolders;
    notices.length = 0;
    try {
        actions.saveGuildFolders = () => { throw new Error("offline"); };
        controller.renameFolder("42", "First");
        actions.saveGuildFolders = () => Promise.reject(new Error("offline"));
        controller.renameFolder("42", "Second");
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(notices.length, 2);
        assert.ok(notices.every(text => text.includes("could not sync")));
    } finally { actions.saveGuildFolders = save; }
});
test("moving a server out keeps the folder name and other members, then syncs", () => {
    calls.length = 0;
    saves.length = 0;
    assert.equal(controller.removeGuildFromFolder("a", "42"), true);
    assert.deepEqual(copy(calls), [["editGuildFolderLocal", 42, ["b"], "Friends"]]);
    assert.equal(saves.length, 1);
});
test("the last server can be removed without leaving the guild", () => {
    const original = folder.children;
    calls.length = 0;
    saves.length = 0;
    try {
        folder.children = [{ id: "a", type: "guild" }];
        assert.equal(controller.removeGuildFromFolder("a", "42"), true);
        assert.deepEqual(copy(calls), [["editGuildFolderLocal", 42, [], "Friends"]]);
        assert.equal(saves.length, 1);
    } finally { folder.children = original; }
});
test("a stale or mismatched folder exit cannot alter or save the account layout", () => {
    calls.length = 0;
    saves.length = 0;
    assert.equal(controller.removeGuildFromFolder("a", "missing"), false);
    assert.equal(controller.removeGuildFromFolder("c", "42"), false);
    assert.equal(controller.removeGuildFromFolder("missing", "42"), false);
    assert.equal(calls.length, 0);
    assert.equal(saves.length, 0);
});
const { hitsDropTarget } = await load("plugins/serverdrawer/js/dropTarget.ts");
test("folder exit uses measured window coordinates with a small finger margin", () => {
    const bounds = { x: 240, y: 50, width: 44, height: 44 };
    assert.equal(hitsDropTarget({ x: 260, y: 70 }, bounds), true);
    assert.equal(hitsDropTarget({ x: 234, y: 70 }, bounds), true);
    assert.equal(hitsDropTarget({ x: 260, y: 110 }, bounds), false);
    assert.equal(hitsDropTarget({ x: 20, y: 20 }, bounds), false);
});
test("unmeasured, detached, or nonfinite drop bounds never remove a server", () => {
    assert.equal(hitsDropTarget({ x: 0, y: 0 }, undefined), false);
    assert.equal(hitsDropTarget({ x: 0, y: 0 }, { x: 0, y: 0, width: 0, height: 0 }), false);
    assert.equal(hitsDropTarget({ x: NaN, y: 0 }, { x: 0, y: 0, width: 44, height: 44 }), false);
});
test("required store methods are checked before installation", () => {
    for (const [store, methods] of Object.entries({ SortedGuildStore: ["getGuildsTree", "getGuildFolderById"], ChannelStore: ["getChannel"], UserStore: ["getUser"], GuildStore: ["getGuild", "removeChangeListener"], PrivateChannelSortStore: ["getPrivateChannelIds"] })) {
        for (const method of methods) {
            const original = stores[store][method];
            try {
                stores[store][method] = undefined;
                assert.throws(createController, new RegExp(`${store}\\.${method}`));
            } finally { stores[store][method] = original; }
        }
    }
});
test("partial subscription failure rolls back earlier subscriptions", () => {
    const attached = new Set();
    const add = stores.ChannelStore.addChangeListener;
    const remove = stores.ChannelStore.removeChangeListener;
    const fail = stores.GuildStore.addChangeListener;
    try {
        stores.ChannelStore.addChangeListener = (listener: unknown) => attached.add(listener);
        stores.ChannelStore.removeChangeListener = (listener: unknown) => attached.delete(listener);
        stores.GuildStore.addChangeListener = () => { throw Error("subscription failure"); };
        assert.throws(() => controller.subscribe(() => {}), /subscription failure/);
        assert.equal(attached.size, 0);
    } finally {
        stores.ChannelStore.addChangeListener = add;
        stores.ChannelStore.removeChangeListener = remove;
        stores.GuildStore.addChangeListener = fail;
    }
});
test("Back checks the current route at press time, passes through hidden panels, and detaches", () => {
    let route = "guilds";
    let closes = 0;
    actions.getRootNavigationRef = () => ({ getCurrentRoute: () => ({ name: route }) });
    const stop = controller.addBackHandler(() => { closes++; return true; });
    try {
        assert.equal(backListener?.(), true);
        for (const hidden of ["channel", "settings", "new-message", "modal"]) {
            route = hidden;
            assert.equal(backListener?.(), false);
        }
        route = "guilds";
        assert.equal(backListener?.(), true);
        assert.equal(closes, 2);
    } finally { stop(); actions.getRootNavigationRef = undefined; }
    assert.equal(backListener, undefined);
});
const { reportActionFailure } = await load("plugins/serverdrawer/js/errors.ts");
test("failed user actions show retry feedback and log technical context", () => {
    notices.length = 0;
    logged.length = 0;
    reportActionFailure("move this item", Error("native action failed"));
    assert.match(notices[0], /Could not move this item.*try again/);
    assert.match(String(logged[0]), /native action failed/);
});
test("palette resolves native registered styles and follows theme changes", async () => {
    let theme = "dark";
    const registered = new Map<number, { color: string }>();
    const colors = Object.fromEntries(["BACKGROUND_BASE_LOWEST", "BORDER_SUBTLE", "TEXT_BRAND", "GUILD_FOLDER_BACKGROUND", "STATUS_DANGER", "BACKGROUND_BASE_LOWER", "TEXT_MUTED", "TEXT_DEFAULT", "BACKGROUND_SECONDARY_ALT"].map(key => [key, key]));
    const createStyles = (styles: Record<string, { color: string }>) => () => Object.fromEntries(Object.entries(styles).map(([key, style], index) => {
        assert.ok(style.color, `Missing native color token: ${key}`);
        registered.set(index, { color: `${theme}:${style.color}` });
        return [key, index];
    }));
    const result = await build({ entryPoints: ["plugins/serverdrawer/js/theme.ts"], bundle: true, write: false, format: "cjs", plugins: [{ name: "theme-host", setup(builder) {
        builder.onResolve({ filter: /^(?:@revenge-mod\/discord\/common\/tokens|\.\/metro|react-native)$/ }, args => ({ path: args.path, namespace: "theme-host" }));
        builder.onLoad({ filter: /.*/, namespace: "theme-host" }, () => ({ contents: "export const Tokens = { default: { colors: globalThis.colors } }; export const findByProps = () => ({ createStyles: globalThis.createStyles }); export const StyleSheet = { flatten: id => globalThis.registered.get(id) };" }));
    } }] });
    const context = { module: { exports: {} as any }, colors, registered, createStyles };
    vm.runInNewContext(result.outputFiles[0].text, context);
    context.module.exports.initializeTheme();
    const dark = context.module.exports.usePalette();
    assert.equal(dark.normal, "dark:TEXT_DEFAULT");
    theme = "light";
    const light = context.module.exports.usePalette();
    assert.equal(light.normal, "light:TEXT_DEFAULT");
    assert.equal(light.folder, "light:GUILD_FOLDER_BACKGROUND");
    assert.notEqual(dark.background, light.background);
});

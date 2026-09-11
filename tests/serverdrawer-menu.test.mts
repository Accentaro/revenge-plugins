import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["plugins/serverdrawer/js/menu.ts"], bundle: true, write: false, format: "cjs", plugins: [{ name: "host", setup(builder) {
    builder.onResolve({ filter: /^(?:@revenge-mod\/discord\/design|react|react-native|\.\/errors|\.\/metro)$/ }, args => ({ path: args.path, namespace: "host" }));
    builder.onLoad({ filter: /.*/, namespace: "host" }, () => ({ contents: `export const Design = { ContextMenu: () => null }; export const findByNameUsingStore = (_store, name) => globalThis.host.findByName(name); export const findByPropsInDependencies = (_anchor, ...props) => globalThis.host.findByProps(...props); export const { reportActionFailure, findByName, findByProps, findByStoreName, GuildStore, useEffect, useRef, Dimensions } = globalThis.host;` }));
} }] });
function fixture() {
    let current: any;
    let selected = -1;
    let actions = 0;
    let cleanup: (() => void) | undefined;
    const failures: string[] = [];
    const items = [{ label: "Native action", action: () => { actions++; } }];
    const native = {
        ContextMenuStore: { getState: () => ({ menu: current }) },
        useContextMenuState: () => ({ activeIndex: { get: () => selected, set: (value: number) => { selected = value; } } }),
        showContextMenu: (menu: unknown) => { current = menu; },
        hideContextMenu: () => { current = undefined; },
    };
    const context = { module: { exports: {} as any }, host: {
        findByName: () => (id: string, version: number) => { assert.equal(id, "guild"); assert.equal(version, 9); return items; },
        findByProps: (...props: string[]) => props.includes("CONTEXT_MENU_MIN_WIDTH") ? { CONTEXT_MENU_MIN_WIDTH: 220, CONTEXT_MENU_EDGE_OFFSET: 12 } : native,
        Dimensions: { get: () => ({ width: 384, height: 824 }) },
        findByStoreName: (name: string) => name === "GuildStore" ? { getGuild: () => ({ name: "Server" }) } : ({ getGuildsTree: () => ({ version: 9 }) }),
        GuildStore: { getGuild: (id: string) => id === "guild" ? { name: "Server" } : undefined },
        reportActionFailure: (operation: string) => failures.push(operation),
        useRef: () => ({ current: undefined }),
        useEffect: (effect: () => () => void) => { cleanup = effect(); },
    } };
    vm.runInNewContext(bundle.outputFiles[0].text, context);
    const abort = new AbortController();
    const open = context.module.exports.createGuildMenu()(abort.signal);
    return { open, abort, native, items, failures, get menu() { return current; }, get actions() { return actions; }, select(index: number) { selected = index; }, cleanup: () => cleanup?.(), create: context.module.exports.createGuildMenu };
}
test("native menu preserves native items and invokes the selected native action", () => {
    const f = fixture();
    f.open("guild", 100, 200);
    assert.equal(f.menu.title, "Server");
    assert.equal(f.menu.items, f.items);
    f.select(0);
    f.menu.requestClose(false);
    assert.equal(f.actions, 1);
    assert.equal(f.menu, undefined);
});
test("dismissal never invokes an action", () => {
    const f = fixture();
    f.open("guild", 100, 200);
    f.select(0);
    f.menu.requestClose(true);
    assert.equal(f.actions, 0);
});
test("abort closes the owned menu and prevents later opens", () => {
    const f = fixture();
    f.open("guild", 100, 200);
    f.abort.abort();
    assert.equal(f.menu, undefined);
    f.open("guild", 100, 200);
    assert.equal(f.menu, undefined);
});
test("unmount does not dismiss another native menu", () => {
    const f = fixture();
    f.open("guild", 100, 200);
    f.native.showContextMenu({ key: "another-plugin" });
    f.cleanup();
    assert.equal(f.menu.key, "another-plugin");
});
test("stale guilds and missing native menu targets fail safely", () => {
    const f = fixture();
    f.open("missing", 100, 200);
    assert.equal(f.menu, undefined);
    assert.deepEqual(f.failures, ["open the server menu"]);
    f.native.showContextMenu = undefined as any;
    assert.throws(f.create, /showContextMenu is unavailable/);
});
test("dock menus open above and right-edge menus retain the native minimum width", () => {
    const f = fixture();
    for (const x of [0, 26, 192, 358, 384]) {
        f.open("guild", x, 740);
        assert.equal(f.menu.positionY, "above");
        assert.ok(f.menu.x >= 12);
        assert.ok(f.menu.x + 220 <= 384 - 12);
        assert.ok(f.menu.y >= 12 && f.menu.y < 412);
        f.open("guild", x, 100);
        assert.equal(f.menu.positionY, "below");
        assert.ok(f.menu.y >= 12 && f.menu.y < 412);
    }
});

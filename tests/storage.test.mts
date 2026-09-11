import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
test("preferences update immediately, serialize complete snapshots, and unsubscribe", async () => {
    const writes: { value: unknown; replace: boolean }[] = [];
    const storage = {
        get: async () => ({ dmOrder: ["dm"], layout: "list", serverOrder: ["a", "b"] }),
        async set(value: unknown, replace: boolean) {
            await new Promise(resolve => setImmediate(resolve));
            writes.push({ value: JSON.parse(JSON.stringify(value)), replace });
        },
    };
    const result = await build({
        entryPoints: ["plugins/serverdrawer/js/storage.ts"], bundle: true, write: false, format: "cjs",
        plugins: [{ name: "storage-host", setup(builder) {
            builder.onResolve({ filter: /^(?:@revenge-mod\/json-storage|\.\/errors)$/ }, args => ({ path: args.path, namespace: "host" }));
            builder.onLoad({ filter: /.*/, namespace: "host" }, () => ({ contents: "export const getJsonStorage = () => globalThis.storage; export const pluginStoragePathFor = id => id; export const reportActionFailure = (_operation, error) => { throw error; };" }));
        } }],
    });
    const context = { module: { exports: {} as any }, storage };
    vm.runInNewContext(result.outputFiles[0].text, context);
    const preferences = await context.module.exports.createPreferences();
    assert.equal(preferences.get().layout, "list");
    let changes = 0;
    const unsubscribe = preferences.subscribe(() => { changes++; });
    preferences.update({ serverOrder: ["b"] });
    preferences.update({ layout: "grid" });
    assert.deepEqual(Array.from(preferences.get().serverOrder), ["b"]);
    assert.equal(preferences.get().layout, "grid");
    assert.equal(changes, 2);
    unsubscribe();
    preferences.update({ dmOrder: [] });
    assert.equal(changes, 2);
    for (let index = 0; index < 4; index++) await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(writes, [
        { value: { dmOrder: ["dm"], layout: "list", serverOrder: ["b"] }, replace: true },
        { value: { dmOrder: ["dm"], layout: "grid", serverOrder: ["b"] }, replace: true },
        { value: { dmOrder: [], layout: "grid", serverOrder: ["b"] }, replace: true },
    ]);
});

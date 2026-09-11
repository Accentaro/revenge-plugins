import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
    ReactLikeElement,
} from "../plugins/serverdrawer/js/layout.ts";
import {
    SERVER_DRAWER_DOCK_MARKER,
    replaceReactElementType,
    transformLeftPanelContent,
} from "../plugins/serverdrawer/js/layout.ts";
interface TestElement extends ReactLikeElement {
    readonly key: string | null;
    readonly props: Readonly<Record<PropertyKey, unknown>>;
    readonly type: string;
}
function element(type: string, props: Record<PropertyKey, unknown>, key: string | null = null): TestElement {
    return { key, props, type };
}
function validTree(style: unknown = { flex: 1 }) {
    const rail = element("ServerRail", { accessibilityLabel: "Servers" }, "rail");
    const content = {
        key: "content",
        owner: "discord",
        props: { accessibilityLabel: "Channels", style },
        type: "ChannelDrawer",
    };
    const children = [rail, content];
    const root = {
        key: "root",
        props: { children, testID: "left-panel" },
        ref: "preserved",
        type: "LeftPanelContent",
    };
    return { children, content, rail, root };
}
function resultChildren(result: ReactLikeElement): readonly unknown[] {
    return result.props.children as readonly unknown[];
}
describe("ServerDrawer LeftPanelContent layout", () => {
    it("replaces a frozen host element type without disturbing its descriptors", () => {
        const originalType = function LeftPanelContent(): undefined { return undefined; };
        const replacementType = function WrappedLeftPanelContent(): undefined { return undefined; };
        const original = Object.freeze(element(originalType.name, Object.freeze({ value: 1 }), "left"));
        const typed = Object.defineProperty({ ...original, type: originalType }, "owner", {
            enumerable: false,
            value: "discord",
        });
        Object.freeze(typed);
        const replaced = replaceReactElementType(typed, replacementType);
        assert.ok(replaced);
        assert.equal(replaced.type, replacementType);
        assert.equal(replaced.props, typed.props);
        assert.equal(replaced.key, typed.key);
        assert.equal(Object.getOwnPropertyDescriptor(replaced, "owner")?.value, "discord");
        assert.equal(Object.getOwnPropertyDescriptor(replaced, "owner")?.enumerable, false);
        assert.equal(typed.type, originalType);
        assert.equal(replaceReactElementType(typed, undefined), undefined);
    });
    it("structurally hides the rail, adjusts content, and appends the supplied dock", () => {
        const originalStyle = [{ flex: 1 }, 42];
        const { children, content, root } = validTree(originalStyle);
        const dock = element("ServerDock", { position: "bottom" }, "server-drawer-dock");
        const transformed = transformLeftPanelContent(root, dock, 84);
        assert.ok(transformed);
        assert.notEqual(transformed, root);
        assert.equal(transformed.type, root.type);
        assert.equal(transformed.key, root.key);
        assert.equal((transformed as unknown as { ref: unknown }).ref, "preserved");
        assert.equal(transformed.props.testID, "left-panel");
        assert.notEqual(transformed.props, root.props);
        const nextChildren = resultChildren(transformed);
        assert.notEqual(nextChildren, children);
        assert.equal(nextChildren.length, 3);
        assert.equal(nextChildren[0], null);
        assert.equal(nextChildren[2], dock);
        assert.equal(Reflect.get(nextChildren, SERVER_DRAWER_DOCK_MARKER), true);
        assert.equal(Object.keys(nextChildren).includes(String(SERVER_DRAWER_DOCK_MARKER)), false);
        const nextContent = nextChildren[1] as typeof content;
        assert.notEqual(nextContent, content);
        assert.equal(nextContent.type, content.type);
        assert.equal(nextContent.key, content.key);
        assert.equal(nextContent.owner, content.owner);
        assert.equal(nextContent.props.accessibilityLabel, "Channels");
        assert.deepEqual(nextContent.props.style, [
            { flex: 1 },
            42,
            { bottom: 84, left: 0, right: 0, width: "100%" },
        ]);
        assert.deepEqual(root.props.children, children);
        assert.equal(root.props.children[0], children[0]);
        assert.equal(root.props.children[1], content);
        assert.deepEqual(content.props.style, originalStyle);
    });
    it("can retain the native rail inside a hidden warm-up element for one render", () => {
        const { rail, root } = validTree();
        const hidden = element("HiddenRail", { children: rail }, "hidden-native-rail");
        const transformed = transformLeftPanelContent(
            root,
            element("Dock", {}, "dock"),
            64,
            candidate => {
                assert.equal(candidate, rail);
                return hidden;
            },
        );
        assert.ok(transformed);
        assert.equal(resultChildren(transformed)[0], hidden);
        assert.equal(root.props.children[0], rail);
    });
    it("preserves a scalar or explicitly undefined host style before the dock inset", () => {
        const scalar = transformLeftPanelContent(validTree(17).root, element("Dock", {}, "dock"), 50);
        assert.deepEqual((resultChildren(scalar!)[1] as TestElement).props.style, [
            17,
            { bottom: 50, left: 0, right: 0, width: "100%" },
        ]);
        const undefinedStyleRoot = element("Root", {
            children: [element("Rail", {}), element("Content", { style: undefined })],
        });
        const undefinedStyle = transformLeftPanelContent(undefinedStyleRoot, element("Dock", {}, "dock"), 0);
        assert.deepEqual((resultChildren(undefinedStyle!)[1] as TestElement).props.style, [
            undefined,
            { bottom: 0, left: 0, right: 0, width: "100%" },
        ]);
    });
    it("is idempotent through its structural marker even when the dock has no key", () => {
        const { root } = validTree();
        const dock = element("ServerDock", {}, null);
        const first = transformLeftPanelContent(root, dock, 64);
        assert.ok(first);
        assert.equal(transformLeftPanelContent(first, dock, 64), first);
        assert.equal(resultChildren(first).length, 3);
    });
    it("recognises an existing dock by key or an explicit element marker", () => {
        const dock = element("ServerDock", {}, "stable-dock");
        const keyedRoot = element("LeftPanelContent", {
            children: [element("Content", { style: {} }), dock, element("Overlay", {})],
        });
        assert.equal(transformLeftPanelContent(keyedRoot, dock, 72), keyedRoot);
        const markedDock = Object.defineProperty(element("ServerDock", {}, null), SERVER_DRAWER_DOCK_MARKER, {
            value: true,
        });
        const markedRoot = element("LeftPanelContent", {
            children: [element("Content", { style: {} }), markedDock, element("Overlay", {})],
        });
        assert.equal(transformLeftPanelContent(markedRoot, element("ServerDock", {}, null), 72), markedRoot);
    });
    it("matches only the exact root shape and validates both native children", () => {
        const dock = element("Dock", {}, "dock");
        const cases: unknown[] = [
            undefined,
            null,
            "LeftPanelContent",
            [],
            { props: { children: [] } },
            { type: "Root" },
            element("Root", {}),
            element("Root", { children: "not-an-array" }),
            element("Root", { children: [] }),
            element("Root", { children: [element("Rail", {})] }),
            element("Root", {
                children: [element("Rail", {}), element("Content", { style: {} }), element("Overlay", {})],
            }),
            element("Root", { children: [null, element("Content", { style: {} })] }),
            element("Root", { children: [element("Rail", {}), null] }),
            element("Root", { children: [element("Rail", {}), { props: { style: {} } }] }),
            element("Root", { children: [element("Rail", {}), element("Content", {})] }),
        ];
        for (const candidate of cases) {
            assert.equal(transformLeftPanelContent(candidate, dock, 72), undefined);
        }
        assert.equal(transformLeftPanelContent(validTree().root, {}, 72), undefined);
        assert.equal(transformLeftPanelContent(validTree().root, dock, -1), undefined);
        assert.equal(transformLeftPanelContent(validTree().root, dock, Number.NaN), undefined);
        assert.equal(transformLeftPanelContent(validTree().root, dock, Number.POSITIVE_INFINITY), undefined);
        const nested = element("Wrapper", {
            children: element("Root", {
                children: [element("Rail", {}), element("Content", { style: {} })],
            }),
        });
        assert.equal(transformLeftPanelContent(nested, dock, 72), undefined);
    });
    it("preserves non-enumerable fields and does not invoke unrelated getters", () => {
        let getterCalls = 0;
        const { content, root } = validTree();
        Object.defineProperty(root, "secret", { enumerable: false, value: 9 });
        Object.defineProperty(root, "unused", {
            enumerable: true,
            get() {
                getterCalls++;
                throw new Error("must not be read");
            },
        });
        Object.defineProperty(content, "unused", {
            get() {
                getterCalls++;
                throw new Error("must not be read");
            },
        });
        const transformed = transformLeftPanelContent(root, element("Dock", {}, "dock"), 40);
        assert.ok(transformed);
        assert.equal(getterCalls, 0);
        assert.equal(Object.getOwnPropertyDescriptor(transformed, "secret")?.value, 9);
        assert.equal(Object.getOwnPropertyDescriptor(transformed, "secret")?.enumerable, false);
        assert.throws(() => Reflect.get(transformed, "unused"), /must not be read/);
        assert.throws(() => Reflect.get(resultChildren(transformed)[1] as object, "unused"), /must not be read/);
    });
    it("can clone frozen React-style records without changing their descriptors", () => {
        const rail = Object.freeze(element("Rail", Object.freeze({}), "rail"));
        const contentProps = Object.freeze({ style: Object.freeze([{ flex: 1 }]) });
        const content = Object.freeze(element("Content", contentProps, "content"));
        const rootProps = Object.freeze({ children: Object.freeze([rail, content]) });
        const root = Object.freeze(element("Root", rootProps, "root"));
        const transformed = transformLeftPanelContent(root, element("Dock", {}, "dock"), 30);
        assert.ok(transformed);
        assert.equal(Object.getOwnPropertyDescriptor(transformed, "props")?.writable, false);
        const nextContent = resultChildren(transformed)[1] as ReactLikeElement;
        assert.equal(Object.getOwnPropertyDescriptor(nextContent, "props")?.writable, false);
        assert.equal(Object.getOwnPropertyDescriptor(nextContent.props, "style")?.writable, false);
        assert.deepEqual(content.props.style, [{ flex: 1 }]);
    });
    it("never leaks exceptions from getters, proxies, or revoked proxies", () => {
        const dock = element("Dock", {}, "dock");
        const throwingProps = Object.defineProperty({ type: "Root" }, "props", {
            get() {
                throw new Error("props getter");
            },
        });
        const throwingChildren = element("Root", Object.defineProperty({}, "children", {
            get() {
                throw new Error("children getter");
            },
        }));
        const throwingStyle = element("Root", {
            children: [
                element("Rail", {}),
                element("Content", Object.defineProperty({}, "style", {
                    get() {
                        throw new Error("style getter");
                    },
                })),
            ],
        });
        const hostileClone = new Proxy(validTree().root, {
            ownKeys() {
                throw new Error("ownKeys trap");
            },
        });
        const { proxy: revoked, revoke } = Proxy.revocable({}, {});
        revoke();
        for (const candidate of [throwingProps, throwingChildren, throwingStyle, hostileClone, revoked]) {
            assert.doesNotThrow(() => transformLeftPanelContent(candidate, dock, 72));
            assert.equal(transformLeftPanelContent(candidate, dock, 72), undefined);
        }
        const hostileDock = new Proxy(dock, {
            get(_target, property) {
                if (property === "key") throw new Error("key trap");
                return Reflect.get(dock, property);
            },
        });
        assert.doesNotThrow(() => transformLeftPanelContent(validTree().root, hostileDock, 72));
        assert.equal(transformLeftPanelContent(validTree().root, hostileDock, 72), undefined);
    });
});

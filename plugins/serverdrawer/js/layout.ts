export interface ReactLikeElement {
    readonly key?: unknown;
    readonly props: Readonly<Record<PropertyKey, unknown>>;
    readonly type: unknown;
}
/** Stable across duplicate runtime bundles while remaining invisible to React props. */
export const SERVER_DRAWER_DOCK_MARKER = Symbol.for("rain.serverdrawer.dock");
type MutableDescriptorMap = Record<PropertyKey, PropertyDescriptor>;
interface InspectedElement {
    readonly element: ReactLikeElement;
    readonly object: object;
    readonly props: Readonly<Record<PropertyKey, unknown>>;
    readonly propsObject: object;
}
function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function inspectElement(value: unknown): InspectedElement | undefined {
    if (!isRecord(value)) return undefined;
    const type = Reflect.get(value, "type");
    const props = Reflect.get(value, "props");
    if (type === null || type === undefined || !isRecord(props)) return undefined;
    return {
        element: value as unknown as ReactLikeElement,
        object: value,
        props,
        propsObject: props,
    };
}
function replacementDescriptor(
    current: PropertyDescriptor | undefined,
    value: unknown,
): PropertyDescriptor {
    return {
        configurable: current?.configurable ?? true,
        enumerable: current?.enumerable ?? true,
        value,
        writable: current && "writable" in current ? current.writable : true,
    };
}
function cloneReplacing(source: object, key: PropertyKey, value: unknown): object {
    const descriptors = Object.getOwnPropertyDescriptors(source) as MutableDescriptorMap;
    descriptors[key] = replacementDescriptor(descriptors[key], value);
    return Object.create(Object.getPrototypeOf(source), descriptors) as object;
}
export function replaceReactElementType(
    element: unknown,
    replacement: unknown,
): ReactLikeElement | undefined {
    try {
        const inspected = inspectElement(element);
        if (!inspected || (typeof replacement !== "function"
            && (typeof replacement !== "object" || replacement === null))) return undefined;
        return cloneReplacing(inspected.object, "type", replacement) as ReactLikeElement;
    } catch {
        return undefined;
    }
}
function readableKey(element: ReactLikeElement): string | number | undefined {
    const key = Reflect.get(element, "key");
    return typeof key === "string" || (typeof key === "number" && Number.isFinite(key))
        ? key
        : undefined;
}
function isMarked(value: unknown): boolean {
    return (typeof value === "object" && value !== null)
        && Reflect.get(value, SERVER_DRAWER_DOCK_MARKER) === true;
}
function alreadyContainsDock(children: readonly unknown[], dockKey: string | number | undefined): boolean {
    if (isMarked(children)) return true;
    for (let index = 0; index < children.length; index++) {
        const child = children[index];
        if (isMarked(child)) return true;
        if (dockKey === undefined || typeof child !== "object" || child === null) continue;
        if (Object.is(Reflect.get(child, "key"), dockKey)) return true;
    }
    return false;
}
function appendedStyle(style: unknown, dockHeight: number): readonly unknown[] {
    const values = Array.isArray(style) ? style.slice() : [style];
    values.push(Object.freeze({
        bottom: dockHeight,
        left: 0,
        right: 0,
        width: "100%",
    }));
    return values;
}
/**
 * Hides LeftPanelContent's server rail, gives its content room for the dock, and appends the dock.
 * Any host-shape drift or hostile reflective object is treated as a non-match.
 */
export function transformLeftPanelContent(
    rendered: unknown,
    dock: unknown,
    dockHeight: number,
    retainHiddenRail?: (rail: ReactLikeElement) => unknown,
): ReactLikeElement | undefined {
    try {
        if (!Number.isFinite(dockHeight) || dockHeight < 0) return undefined;
        const root = inspectElement(rendered);
        const inspectedDock = inspectElement(dock);
        if (!root || !inspectedDock) return undefined;
        const childrenValue = Reflect.get(root.props, "children");
        if (!Array.isArray(childrenValue)) return undefined;
        if (alreadyContainsDock(childrenValue, readableKey(inspectedDock.element))) return root.element;
        if (childrenValue.length !== 2) return undefined;
        const rail = inspectElement(childrenValue[0]);
        const content = inspectElement(childrenValue[1]);
        if (!rail || !content || !Reflect.has(content.props, "style")) return undefined;
        const style = Reflect.get(content.props, "style");
        const nextContentProps = cloneReplacing(
            content.propsObject,
            "style",
            appendedStyle(style, dockHeight),
        );
        const nextContent = cloneReplacing(content.object, "props", nextContentProps);
        const retainedRail = retainHiddenRail
            ? inspectElement(retainHiddenRail(rail.element))?.element ?? null
            : null;
        const nextChildren: unknown[] = [retainedRail, nextContent, inspectedDock.element];
        Object.defineProperty(nextChildren, SERVER_DRAWER_DOCK_MARKER, {
            configurable: false,
            enumerable: false,
            value: true,
            writable: false,
        });
        const nextRootProps = cloneReplacing(root.propsObject, "children", nextChildren);
        return cloneReplacing(root.object, "props", nextRootProps) as ReactLikeElement;
    } catch {
        return undefined;
    }
}

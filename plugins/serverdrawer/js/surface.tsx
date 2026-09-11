import type { DropBounds, } from "./dropTarget";
import { hitsDropTarget } from "./dropTarget";
import { reportActionFailure } from "./errors";
import type {
    CompactDockItem,
    DrawerFolder,
    DrawerGuild,
    DrawerNode,
    GuildMetadata,
    GuildReadState,
} from "./model";
import {
    buildCompactDockItems,
    computeGuildDockSpecs,
    guildsInTreeOrder,
    parseGuildTree,
} from "./model";
import { usePalette } from "./theme";
import type { HostComponent, Preferences, SurfaceApi, Unpatch } from "./types";
/** Largest phone dock produced by Discord 213's recovered sizing function. */
export const SERVER_DOCK_HEIGHT = 85;
export const SERVER_DOCK_OFFSET = 8;
const DRAWER_ICON_SIZE = 52;
const DRAWER_ITEM_WIDTH = DRAWER_ICON_SIZE + 12;
const DRAWER_GAP = 12;
const DRAWER_SIDE_PADDING = 16;
const DRAWER_MIN_HEIGHT = 400;
const DRAWER_MAX_HEIGHT = 832;
const DRAWER_MIN_INSET = 32;
const DRAWER_TRANSITION_HEIGHT = 200;
const DOCK_MAX_WIDTH = 454;
const REORDER_LONG_PRESS_MS = 500;
const SWIPE_DISTANCE = 30;
const SWIPE_VELOCITY = 200;
export type DrawerLayout = "grid" | "list";
export type DrawerView = "dms" | "servers";
export interface ServerDrawerPreferences {
    readonly dmOrder: readonly string[];
    readonly layout: DrawerLayout;
    readonly serverOrder: readonly string[];
}
export interface DirectMessageMetadata {
    readonly avatarUri?: string;
    readonly id: string;
    readonly name: string;
}
export interface ServerDrawerSnapshot {
    readonly privateChannels?: readonly DirectMessageMetadata[];
    readonly selectedPrivateChannelId?: string;
    readonly selectedGuildId?: string;
    readonly tree: unknown;
    readonly unavailableGuildCount?: number;
}
export interface ServerDrawerController {
    addBackHandler?(listener: () => boolean): Unpatch | undefined;
    animateNext?(durationMs?: number): void;
    haptic?(kind?: "light" | "medium" | "soft"): void;
    moveGuild?(sourceId: string, targetId: string): boolean;
    dropGuild?(sourceId: string, targetId: string): boolean;
    removeGuildFromFolder?(sourceId: string, folderId: string): boolean;
    renameFolder?(folderId: string, name: string): boolean;
    openCreateDm?(): boolean;
    openCreateGuild?(): boolean;
    readPrivateChannelState?(channelId: string): GuildReadState | undefined;
    readState(guildId: string): GuildReadState | undefined;
    resolveGuild(guildId: string): GuildMetadata | undefined;
    selectGuild(guildId: string): boolean;
    selectPrivateChannel?(channelId: string): boolean;
    snapshot(): ServerDrawerSnapshot;
    subscribe(listener: () => void): Unpatch;
    readonly FlatList?: HostComponent | undefined;
}
interface ReactHooks {
    useCallback<Callback extends (...arguments_: never[]) => unknown>(callback: Callback, dependencies: readonly unknown[]): Callback;
    useEffect(effect: () => void | Unpatch, dependencies: readonly unknown[]): void;
    useMemo<Value>(factory: () => Value, dependencies: readonly unknown[]): Value;
    useRef<Value>(value: Value): { current: Value };
    useState<Value>(value: Value | (() => Value)): [Value, (next: Value | ((previous: Value) => Value)) => void];
}
interface GestureState {
    claimed: boolean;
    readonly height: number;
    lastAt: number;
    lastY: number;
    velocity: number;
    readonly x: number;
    readonly y: number;
}
interface DragPoint {
    readonly x: number;
    readonly y: number;
}
interface NativeDragPreview {
    setNativeProps?(properties: Readonly<Record<string, unknown>>): void;
}
interface ReorderState {
    readonly columnStep: number;
    readonly columns: number;
    readonly ids: readonly string[];
    readonly initialOrder: readonly string[];
    readonly layout: DrawerLayout;
    readonly rowStep: number;
    readonly sourceId: string;
    readonly sourceIndex: number;
    readonly startX: number;
    readonly startY: number;
    targetId: string;
    mergeSince?: number;
    moved?: boolean;
    readonly sourceFolderId?: string;
    removeFromFolder?: boolean;
    readonly view: DrawerView;
}
interface DirectMessage extends DirectMessageMetadata {
    readonly mentionLabel: string | undefined;
    readonly mentions: number;
    readonly unread: boolean;
}
interface NativeEventRecord {
    readonly nativeEvent?: {
        readonly absoluteX?: unknown;
        readonly absoluteY?: unknown;
        readonly contentOffset?: { readonly y?: unknown };
        readonly layout?: { readonly height?: unknown; readonly width?: unknown };
        readonly pageX?: unknown;
        readonly pageY?: unknown;
    };
}
interface NativeGestureBuilder {
    activateAfterLongPress?(duration: number): NativeGestureBuilder;
    minDistance?(distance: number): NativeGestureBuilder;
    onEnd?(listener: (event: unknown) => void): NativeGestureBuilder;
    onFinalize?(listener: (event: unknown) => void): NativeGestureBuilder;
    onStart?(listener: (event: unknown) => void): NativeGestureBuilder;
    onTouchesCancelled?(listener: (event: unknown) => void): NativeGestureBuilder;
    onTouchesUp?(listener: (event: unknown) => void): NativeGestureBuilder;
    onUpdate?(listener: (event: unknown) => void): NativeGestureBuilder;
    runOnJS?(enabled: boolean): NativeGestureBuilder;
    shouldCancelWhenOutside?(enabled: boolean): NativeGestureBuilder;
}
interface NativeGestureFactory {
    Pan?(): NativeGestureBuilder;
}
const EMPTY_SNAPSHOT: ServerDrawerSnapshot = Object.freeze({ tree: undefined });
function finite(value: unknown, fallback = 0): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function eventCoordinate(event: unknown, axis: "pageX" | "pageY"): number | undefined {
    const nativeEvent = (event as NativeEventRecord | undefined)?.nativeEvent
        ?? event as NativeEventRecord["nativeEvent"];
    const value = nativeEvent?.[axis]
        ?? nativeEvent?.[axis === "pageX" ? "absoluteX" : "absoluteY"];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function eventWidth(event: unknown): number | undefined {
    const value = (event as NativeEventRecord | undefined)?.nativeEvent?.layout?.width;
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}
function eventHeight(event: unknown): number | undefined {
    const value = (event as NativeEventRecord | undefined)?.nativeEvent?.layout?.height;
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}
function scrollOffset(event: unknown): number {
    return Math.max(0, finite((event as NativeEventRecord | undefined)?.nativeEvent?.contentOffset?.y));
}
function horizontalScrollOffset(event: unknown): number {
    const value = (event as { nativeEvent?: { contentOffset?: { x?: unknown } } } | undefined)
        ?.nativeEvent?.contentOffset?.x;
    return Math.max(0, finite(value));
}
function changedText(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    const text = (value as { nativeEvent?: { text?: unknown } } | undefined)?.nativeEvent?.text;
    return typeof text === "string" ? text : undefined;
}
function normalizedLayout(value: unknown): DrawerLayout {
    return value === "list" ? "list" : "grid";
}
function normalizedOrder(value: unknown): readonly string[] {
    if (!Array.isArray(value)) return Object.freeze([]);
    return Object.freeze([...new Set(value.filter((entry): entry is string => (
        typeof entry === "string" && entry.length > 0
    )))]);
}
function orderedByIds<Item extends { readonly id: string }>(
    items: readonly Item[],
    order: readonly string[],
): readonly Item[] {
    if (items.length < 2 || order.length === 0) return items;
    const ranks = new Map(order.map((id, index) => [id, index]));
    return Object.freeze(items.map((item, index) => ({ index, item })).sort((left, right) => {
        const leftRank = ranks.get(left.item.id);
        const rightRank = ranks.get(right.item.id);
        if (leftRank === undefined && rightRank === undefined) return left.index - right.index;
        if (leftRank === undefined) return 1;
        if (rightRank === undefined) return -1;
        return leftRank - rightRank;
    }).map(entry => entry.item));
}
function orderedNodes(nodes: readonly DrawerNode[], order: readonly string[]): readonly DrawerNode[] {
    return orderedByIds(nodes.map(node => node.kind === "folder"
        ? Object.freeze({ ...node, children: orderedByIds(node.children, order) })
        : node), order);
}
function nodeIds(nodes: readonly DrawerNode[]): readonly string[] {
    return Object.freeze(nodes.flatMap(node => node.kind === "folder"
        ? [node.id, ...node.children.map(child => child.id)]
        : [node.id]));
}
function movedOrder(
    order: readonly string[],
    availableIds: readonly string[],
    sourceId: string,
    targetId: string,
): readonly string[] {
    const available = new Set(availableIds);
    const next = [...order.filter(id => available.has(id))];
    for (const id of availableIds) if (!next.includes(id)) next.push(id);
    const sourceIndex = next.indexOf(sourceId);
    const targetIndex = next.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return order;
    next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, sourceId);
    return Object.freeze(next);
}
function nativeDimension(
    native: Readonly<Record<string, unknown>> | undefined,
    axis: "height" | "width",
    fallback: number,
): number {
    try {
        const dimensions = native?.Dimensions as { get?: (name: string) => unknown } | undefined;
        const window = dimensions?.get?.("window") as Readonly<Record<string, unknown>> | undefined;
        const value = window?.[axis];
        return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
    } catch {
        return fallback;
    }
}
function component(value: unknown): HostComponent | undefined {
    try {
        return typeof value === "function"
            || (typeof value === "object" && value !== null && "$$typeof" in value)
            ? value as HostComponent
            : undefined;
    } catch {
        return undefined;
    }
}
function initials(name: string): string {
    const pieces = name.trim().split(/\s+/u).filter(Boolean);
    return pieces.slice(0, 2).map(piece => piece[0] ?? "").join("").toUpperCase() || "?";
}
function iconUri(guild: DrawerGuild): string | undefined {
    if (!guild.icon) return undefined;
    if (/^https:\/\//iu.test(guild.icon)) return guild.icon;
    const extension = guild.icon.startsWith("a_") ? "gif" : "webp";
    return "https://cdn.discordapp.com/icons/"
        + encodeURIComponent(guild.id) + "/"
        + encodeURIComponent(guild.icon) + "."
        + extension + "?size=128";
}
function folderColor(value: number | undefined, fallback: string): string {
    return value === undefined ? fallback : `#${value.toString(16).padStart(6, "0")}`;
}
function normalizedQuery(value: string): string {
    return value.trim().toLocaleLowerCase();
}
function filteredNodes(
    nodes: readonly DrawerNode[],
    filter: "all" | "unread",
    query: string,
    folder?: DrawerFolder,
): readonly DrawerNode[] {
    const search = normalizedQuery(query);
    const source: readonly DrawerNode[] = folder?.children ?? nodes;
    if (search) {
        return Object.freeze(guildsInTreeOrder(source).filter(guild => (
            guild.name.toLocaleLowerCase().includes(search)
            && (filter === "all" || guild.unread)
        )));
    }
    if (filter === "all") return source;
    const unread: DrawerNode[] = [];
    for (const node of source) {
        if (node.kind === "guild") {
            if (node.unread) unread.push(node);
            continue;
        }
        const children = node.children.filter(child => child.unread);
        if (children.length === 0) continue;
        unread.push(Object.freeze({ ...node, children: Object.freeze(children) }));
    }
    return Object.freeze(unread);
}
function once(cleanup: Unpatch): Unpatch {
    let cleaned = false;
    return () => {
        if (cleaned) return;
        cleaned = true;
        try {
            cleanup();
        } catch {}
    };
}
function useAbortableSubscription(
    hooks: ReactHooks,
    signal: AbortSignal,
    subscribe: (listener: () => void) => Unpatch,
    listener: () => void,
): void {
    hooks.useEffect(() => {
        if (signal.aborted) return () => undefined;
        let cleanup: Unpatch = () => undefined;
        try {
            cleanup = once(subscribe(listener));
        } catch {
            cleanup = once(() => undefined);
        }
        const abort = (): void => cleanup();
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) cleanup();
        else listener();
        return () => {
            signal.removeEventListener("abort", abort);
            cleanup();
        };
    }, [listener, signal, subscribe]);
}
function safeStopPropagation(event: unknown): void {
    try {
        (event as { stopPropagation?: () => void } | undefined)?.stopPropagation?.();
    } catch {}
}
export function createServerDrawerSurface(
    api: SurfaceApi,
    controller: ServerDrawerController,
    preferences: Preferences<ServerDrawerPreferences>,
    signal: AbortSignal,
): HostComponent | undefined {
    const hooks = api.react as unknown as ReactHooks | undefined;
    const native = api.reactNative;
    const NativeImage = component(native?.Image);
    const NativePressable = component(native?.Pressable);
    const NativeScrollView = component(native?.ScrollView);
    const NativeText = component(native?.Text);
    const NativeView = component(native?.View);
    const HostTextInput = component(api.components.TextInput);
    const HostFlatList = component(controller.FlatList);
    let NativeGestureDetector: HostComponent | undefined;
    let nativeGestureFactory: NativeGestureFactory | undefined;
    try {
        const gestureModule = api.modules.findByProps("Gesture", "GestureDetector");
        NativeGestureDetector = component(gestureModule?.GestureDetector);
        const candidate = gestureModule?.Gesture;
        if (typeof candidate === "object" && candidate !== null) {
            nativeGestureFactory = candidate as NativeGestureFactory;
        }
    } catch {}
    if (!hooks?.useCallback || !hooks.useEffect || !hooks.useMemo || !hooks.useRef || !hooks.useState
        || !NativeImage || !NativePressable || !NativeScrollView || !NativeText || !NativeView) {
        return undefined;
    }
    const Image = NativeImage as HostComponent;
    const Pressable = NativePressable as HostComponent;
    const ScrollView = NativeScrollView as HostComponent;
    const Text = NativeText as HostComponent;
    const View = NativeView as HostComponent;
    const FloatingView = NativeView as HostComponent;
    const TextInput = HostTextInput;
    const ChatIcon = api.components.ChatIcon;
    const FlatList = HostFlatList;
    const GestureDetector = NativeGestureDetector;
    const nativeReorderAvailable = Boolean(GestureDetector && nativeGestureFactory?.Pan);
    const gestureHooks = hooks;
    const initialWindowWidth = nativeDimension(native, "width", 360);
    const initialWindowHeight = nativeDimension(native, "height", 720);
    function NativeReorderTarget(properties: {
        readonly children: unknown;
        readonly key?: unknown;
        readonly offset?: DragPoint | undefined;
        readonly onCancel: () => void;
        readonly onDrop: (event: unknown) => void;
        readonly onMove: (event: unknown) => void;
        readonly onStart: (event: unknown) => boolean;
    }): any {
        const callbacks = gestureHooks.useRef(properties);
        const active = gestureHooks.useRef(false);
        callbacks.current = properties;
        const dragGesture = gestureHooks.useMemo(() => {
            if (!nativeGestureFactory?.Pan) return undefined;
            try {
                let builder = nativeGestureFactory.Pan();
                builder = builder.activateAfterLongPress?.(REORDER_LONG_PRESS_MS) ?? builder;
                builder = builder.shouldCancelWhenOutside?.(false) ?? builder;
                builder = builder.runOnJS?.(true) ?? builder;
                builder = builder.onStart?.((event: unknown) => {
                    active.current = callbacks.current.onStart(event);
                }) ?? builder;
                builder = builder.onUpdate?.((event: unknown) => {
                    if (active.current) callbacks.current.onMove(event);
                }) ?? builder;
                builder = builder.onTouchesUp?.((event: unknown) => {
                    if (!active.current) return;
                    active.current = false;
                    callbacks.current.onDrop(event);
                }) ?? builder;
                builder = builder.onTouchesCancelled?.(() => {
                    if (!active.current) return;
                    active.current = false;
                    callbacks.current.onCancel();
                }) ?? builder;
                builder = builder.onEnd?.((event: unknown) => {
                    if (!active.current) return;
                    active.current = false;
                    callbacks.current.onDrop(event);
                }) ?? builder;
                builder = builder.onFinalize?.(() => {
                    if (!active.current) return;
                    active.current = false;
                    callbacks.current.onCancel();
                }) ?? builder;
                return builder;
            } catch {
                return undefined;
            }
        }, []);
        return GestureDetector && dragGesture
            ? <GestureDetector gesture={dragGesture}>
                <View
                    collapsable={false}
                    style={properties.offset
                        ? { transform: [{ translateX: properties.offset.x }, { translateY: properties.offset.y }] }
                        : undefined}
                >
                    {properties.children}
                </View>
            </GestureDetector>
            : properties.children;
    }
    function HeaderLayoutIcon(properties: { readonly layout: DrawerLayout }): any {
        const palette = usePalette();
        if (properties.layout === "grid") {
            return <View pointerEvents="none" style={{ height: 24, justifyContent: "space-between", paddingVertical: 3, width: 24 }}>
                {[0, 1, 2].map(line => <View
                    key={line}
                    style={{ backgroundColor: palette.muted, borderRadius: 2, height: 3, width: 24 }}
                />)}
            </View>;
        }
        return <View pointerEvents="none" style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 4,
            height: 24,
            width: 24,
        }}>
            {[0, 1, 2, 3].map(cell => <View
                key={cell}
                style={{ backgroundColor: palette.muted, borderRadius: 2, height: 10, width: 10 }}
            />)}
        </View>;
    }
    function HeaderAddIcon(): any {
        const palette = usePalette();
        return <View pointerEvents="none" style={{ height: 24, position: "relative", width: 24 }}>
            <View style={{
                backgroundColor: palette.muted,
                borderRadius: 2,
                height: 3,
                left: 0,
                position: "absolute",
                right: 0,
                top: 10.5,
            }} />
            <View style={{
                backgroundColor: palette.muted,
                borderRadius: 2,
                bottom: 0,
                left: 10.5,
                position: "absolute",
                top: 0,
                width: 3,
            }} />
        </View>;
    }
    const initialPreferences = (): ServerDrawerPreferences => {
        try {
            const stored = preferences.get();
            return {
                dmOrder: normalizedOrder(stored.dmOrder),
                layout: normalizedLayout(stored.layout),
                serverOrder: normalizedOrder(stored.serverOrder),
            };
        } catch {
            return { dmOrder: Object.freeze([]), layout: "grid", serverOrder: Object.freeze([]) };
        }
    };
    function GuildArtwork(properties: { readonly guild: DrawerGuild; readonly size: number }): any {
        const uri = iconUri(properties.guild);
        const radius = properties.size >= 44 ? 16 : Math.max(5, Math.round(properties.size * 0.28));
        if (uri) {
            return <Image
                accessibilityIgnoresInvertColors={true}
                resizeMode="cover"
                source={{ uri }}
                style={{ borderRadius: radius, height: properties.size, width: properties.size }}
            />;
        }
        return <View style={{
            alignItems: "center",
            backgroundColor: "#5865f2",
            borderRadius: radius,
            height: properties.size,
            justifyContent: "center",
            width: properties.size,
        }}>
            <Text numberOfLines={1} style={{
                color: "#ffffff",
                fontSize: Math.max(10, Math.round(properties.size * 0.34)),
                fontWeight: "700",
            }}>
                {initials(properties.guild.name)}
            </Text>
        </View>;
    }
    function Badge(properties: {
        readonly compact?: boolean;
        readonly node: { readonly mentionLabel: string | undefined; readonly unread: boolean };
    }): any {
        const palette = usePalette();
        const compact = properties.compact === true;
        if (properties.node.mentionLabel) {
            return <View style={{
                alignItems: "center",
                backgroundColor: palette.danger,
                borderColor: palette.background,
                borderRadius: 10,
                borderWidth: 2,
                bottom: compact ? -3 : -4,
                justifyContent: "center",
                minHeight: compact ? 18 : 20,
                minWidth: compact ? 18 : 20,
                paddingHorizontal: 4,
                position: "absolute",
                right: compact ? -4 : -5,
            }}>
                <Text style={{ color: "#ffffff", fontSize: compact ? 9 : 10, fontWeight: "800" }}>
                    {properties.node.mentionLabel}
                </Text>
            </View>;
        }
        if (!properties.node.unread) return null;
        return <View style={{
            backgroundColor: palette.normal,
            borderColor: palette.background,
            borderRadius: 7,
            borderWidth: 2,
            bottom: compact ? -2 : -3,
            height: compact ? 13 : 14,
            position: "absolute",
            right: compact ? -2 : -3,
            width: compact ? 13 : 14,
        }} />;
    }
    function FolderArtwork(properties: { readonly folder: DrawerFolder; readonly size: number }): any {
        const palette = usePalette();
        const mini = Math.floor(properties.size * 0.34);
        const positions = [
            { left: 6, top: 6 },
            { right: 6, top: 6 },
            { bottom: 6, left: 6 },
            { bottom: 6, right: 6 },
        ] as const;
        return <View style={{
            backgroundColor: folderColor(properties.folder.color, palette.folder),
            borderRadius: properties.size >= 44 ? 16 : 9,
            height: properties.size,
            position: "relative",
            width: properties.size,
        }}>
            {properties.folder.children.slice(0, 4).map((guild, index) => (
                <View key={guild.id} style={{ ...positions[index], position: "absolute" }}>
                    <GuildArtwork guild={guild} size={mini} />
                </View>
            ))}
        </View>;
    }
    function DirectMessageArtwork(properties: { readonly directMessage: DirectMessage; readonly size: number }): any {
        const palette = usePalette();
        if (properties.directMessage.avatarUri) {
            return <Image
                accessibilityIgnoresInvertColors={true}
                resizeMode="cover"
                source={{ uri: properties.directMessage.avatarUri }}
                style={{ borderRadius: properties.size / 2, height: properties.size, width: properties.size }}
            />;
        }
        return <View style={{
            alignItems: "center",
            backgroundColor: palette.input,
            borderRadius: properties.size / 2,
            height: properties.size,
            justifyContent: "center",
            width: properties.size,
        }}>
            <Text numberOfLines={1} style={{
                color: palette.normal,
                fontSize: Math.max(10, Math.round(properties.size * 0.34)),
                fontWeight: "700",
            }}>
                {initials(properties.directMessage.name)}
            </Text>
        </View>;
    }
    function CompactGuild(properties: {
        readonly guild: DrawerGuild;
        readonly key?: unknown;
        readonly onPress: () => void;
        readonly onLongPress: (event: unknown) => void;
        readonly selected: boolean;
        readonly size: number;
    }): any {
        const palette = usePalette();
        return <Pressable
            accessibilityLabel={properties.guild.name
                + (properties.guild.mentionCount > 0
                    ? `, ${properties.guild.mentionCount} mentions`
                    : properties.guild.unread ? ", unread" : "")}
            accessibilityRole="button"
            accessibilityState={{ selected: properties.selected }}
            onPress={properties.onPress}
            onLongPress={properties.onLongPress}
            delayLongPress={REORDER_LONG_PRESS_MS}
            accessibilityHint="Long press for server actions"
            style={{ height: properties.size, width: properties.size }}
        >
            <GuildArtwork guild={properties.guild} size={properties.size} />
            {properties.selected ? <View pointerEvents="none" style={{
                borderColor: palette.muted,
                borderRadius: properties.size / 3 + 3,
                borderWidth: 3,
                bottom: -3,
                left: -3,
                position: "absolute",
                right: -3,
                top: -3,
            }} /> : null}
            <Badge compact={true} node={properties.guild} />
        </Pressable>;
    }
    function CompactFolder(properties: {
        readonly folder: DrawerFolder;
        readonly key?: unknown;
        readonly onPress: () => void;
        readonly size: number;
    }): any {
        return <Pressable
            accessibilityLabel={properties.folder.name ?? "Server folder"}
            accessibilityRole="button"
            onPress={properties.onPress}
            style={{ height: properties.size, width: properties.size }}
        >
            <FolderArtwork folder={properties.folder} size={properties.size} />
            <Badge compact={true} node={properties.folder} />
        </Pressable>;
    }
    function OverflowButton(properties: { readonly key?: unknown; readonly onPress: () => void; readonly size: number }): any {
        const palette = usePalette();
        const square = Math.max(10, Math.floor((properties.size * 0.8 - 5) / 2));
        return <Pressable
            accessibilityLabel="View all servers"
            accessibilityRole="button"
            onPress={properties.onPress}
            style={{ alignItems: "center", height: properties.size, justifyContent: "center", width: properties.size }}
        >
            <View style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 5,
                height: square * 2 + 5,
                width: square * 2 + 5,
            }}>
                {[0, 1, 2, 3].map(value => <View
                    key={value}
                    style={{ backgroundColor: palette.normal, borderRadius: 5, height: square, width: square }}
                />)}
            </View>
        </Pressable>;
    }
    function CreateButton(properties: { readonly key?: unknown; readonly onPress: () => void; readonly size: number }): any {
        const palette = usePalette();
        return <Pressable
            accessibilityLabel="Create a server"
            accessibilityRole="button"
            onPress={properties.onPress}
            style={{
                alignItems: "center",
                borderColor: palette.brand,
                borderRadius: properties.size / 3,
                borderWidth: 1,
                height: properties.size,
                justifyContent: "center",
                width: properties.size,
            }}
        >
            <Text style={{ color: palette.muted, fontSize: Math.round(properties.size * 0.7) }}>＋</Text>
        </Pressable>;
    }
    function UnavailableButton(properties: { readonly count: number; readonly key?: unknown; readonly size: number }): any {
        const palette = usePalette();
        return <View
            accessibilityLabel={`${String(properties.count)} unavailable servers`}
            accessibilityRole="text"
            style={{
                alignItems: "center",
                backgroundColor: palette.input,
                borderRadius: properties.size / 3,
                height: properties.size,
                justifyContent: "center",
                width: properties.size,
            }}
        >
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>{properties.count}</Text>
        </View>;
    }
    function DrawerItem(properties: {
        readonly merging?: boolean;
        readonly dragging: boolean;
        readonly key?: unknown;
        readonly layout: DrawerLayout;
        readonly nativeReorder: boolean;
        readonly node: DrawerNode;
        readonly onFolder: (folder: DrawerFolder) => void;
        readonly onGuild: (guild: DrawerGuild) => void;
        readonly onLongPress: (event: unknown) => void;
        readonly onPressOut: (event: unknown) => void;
        readonly onTouchCancel: () => void;
        readonly onTouchEnd: (event: unknown) => void;
        readonly onTouchMove: (event: unknown) => void;
        readonly selectedGuildId?: string | undefined;
    }): any {
        const palette = usePalette();
        const selected = properties.node.kind === "guild" && properties.node.id === properties.selectedGuildId;
        const artwork = properties.node.kind === "guild"
            ? <GuildArtwork guild={properties.node} size={DRAWER_ICON_SIZE} />
            : <FolderArtwork folder={properties.node} size={DRAWER_ICON_SIZE} />;
        const label = properties.node.kind === "guild" ? properties.node.name : properties.node.name ?? "Folder";
        const press = (): void => properties.node.kind === "guild"
            ? properties.onGuild(properties.node)
            : properties.onFolder(properties.node);
        const accessibilityLabel = label
            + (properties.node.mentionCount > 0
                ? `, ${properties.node.mentionCount} mentions`
                : properties.node.unread ? ", unread" : "");
        if (properties.layout === "list") {
            return <Pressable
                accessibilityLabel={accessibilityLabel}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                cancelable={!properties.dragging}
                delayLongPress={REORDER_LONG_PRESS_MS}
                onLongPress={properties.nativeReorder ? undefined : properties.onLongPress}
                onPress={press}
                onPressOut={properties.nativeReorder ? undefined : properties.onPressOut}
                pressRetentionOffset={{ bottom: 4096, left: 4096, right: 4096, top: 4096 }}
                onTouchCancel={properties.nativeReorder ? undefined : properties.onTouchCancel}
                onTouchEnd={properties.nativeReorder ? undefined : properties.onTouchEnd}
                onTouchMove={properties.nativeReorder ? undefined : properties.onTouchMove}
                style={{
                    alignItems: "center",
                    backgroundColor: selected || properties.merging ? `${palette.brand}24` : "transparent",
                    borderRadius: 12,
                    flexDirection: "row",
                    gap: 14,
                    minHeight: 68,
                    paddingHorizontal: 10,
                    opacity: properties.dragging ? 0.08 : 1,
                    width: "100%",
                }}
            >
                <View style={{ height: DRAWER_ICON_SIZE, position: "relative", width: DRAWER_ICON_SIZE }}>
                    {artwork}
                    <Badge node={properties.node} />
                </View>
                <Text numberOfLines={1} style={{
                    color: selected ? palette.brand : palette.normal,
                    flex: 1,
                    fontSize: 16,
                    fontWeight: selected ? "700" : "500",
                }}>
                    {label}
                </Text>
                {properties.node.kind === "folder"
                    ? <Text style={{ color: palette.muted, fontSize: 22 }}>›</Text>
                    : null}
            </Pressable>;
        }
        return <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            cancelable={!properties.dragging}
            delayLongPress={REORDER_LONG_PRESS_MS}
            onLongPress={properties.nativeReorder ? undefined : properties.onLongPress}
            onPress={press}
            onPressOut={properties.nativeReorder ? undefined : properties.onPressOut}
            pressRetentionOffset={{ bottom: 4096, left: 4096, right: 4096, top: 4096 }}
            onTouchCancel={properties.nativeReorder ? undefined : properties.onTouchCancel}
            onTouchEnd={properties.nativeReorder ? undefined : properties.onTouchEnd}
            onTouchMove={properties.nativeReorder ? undefined : properties.onTouchMove}
            style={{
                alignItems: "center",
                minHeight: 82,
                opacity: properties.dragging ? 0.08 : 1,
                width: DRAWER_ITEM_WIDTH,
            }}
        >
            <View style={{
                alignItems: "center",
                borderColor: selected || properties.merging ? palette.brand : "transparent",
                borderRadius: 20,
                borderWidth: 3,
                height: 62,
                justifyContent: "center",
                width: 62,
            }}>
                <View style={{ height: DRAWER_ICON_SIZE, position: "relative", width: DRAWER_ICON_SIZE }}>
                    {artwork}
                    <Badge node={properties.node} />
                </View>
            </View>
            <Text ellipsizeMode="tail" numberOfLines={1} style={{
                color: selected ? palette.brand : palette.normal,
                fontSize: 11,
                fontWeight: selected ? "700" : "500",
                marginTop: 4,
                textAlign: "center",
                width: 68,
            }}>
                {label}
            </Text>
        </Pressable>;
    }
    function DirectMessageItem(properties: {
        readonly directMessage: DirectMessage;
        readonly dragging: boolean;
        readonly key?: unknown;
        readonly layout: DrawerLayout;
        readonly nativeReorder: boolean;
        readonly onLongPress: (event: unknown) => void;
        readonly onPress: () => void;
        readonly onPressOut: (event: unknown) => void;
        readonly onTouchCancel: () => void;
        readonly onTouchEnd: (event: unknown) => void;
        readonly onTouchMove: (event: unknown) => void;
        readonly selected: boolean;
    }): any {
        const palette = usePalette();
        const accessibilityLabel = properties.directMessage.name
            + (properties.directMessage.mentions > 0
                ? `, ${properties.directMessage.mentions} mentions`
                : properties.directMessage.unread ? ", unread" : "");
        const artwork = <View style={{ height: DRAWER_ICON_SIZE, position: "relative", width: DRAWER_ICON_SIZE }}>
            <DirectMessageArtwork directMessage={properties.directMessage} size={DRAWER_ICON_SIZE} />
            <Badge node={properties.directMessage} />
        </View>;
        const common = {
            accessibilityLabel,
            accessibilityRole: "button",
            accessibilityState: { selected: properties.selected },
            cancelable: !properties.dragging,
            delayLongPress: REORDER_LONG_PRESS_MS,
            onLongPress: properties.nativeReorder ? undefined : properties.onLongPress,
            onPress: properties.onPress,
            onPressOut: properties.nativeReorder ? undefined : properties.onPressOut,
            pressRetentionOffset: { bottom: 4096, left: 4096, right: 4096, top: 4096 },
            onTouchCancel: properties.nativeReorder ? undefined : properties.onTouchCancel,
            onTouchEnd: properties.nativeReorder ? undefined : properties.onTouchEnd,
            onTouchMove: properties.nativeReorder ? undefined : properties.onTouchMove,
        } as const;
        if (properties.layout === "list") {
            return <Pressable {...common} style={{
                alignItems: "center",
                backgroundColor: properties.selected ? `${palette.brand}24` : "transparent",
                borderRadius: 12,
                flexDirection: "row",
                gap: 14,
                minHeight: 68,
                opacity: properties.dragging ? 0.08 : 1,
                paddingHorizontal: 10,
                width: "100%",
            }}>
                {artwork}
                <Text numberOfLines={1} style={{
                    color: properties.selected ? palette.brand : palette.normal,
                    flex: 1,
                    fontSize: 16,
                    fontWeight: properties.selected ? "700" : "500",
                }}>
                    {properties.directMessage.name}
                </Text>
            </Pressable>;
        }
        return <Pressable {...common} style={{
            alignItems: "center",
            minHeight: 82,
            opacity: properties.dragging ? 0.08 : 1,
            width: DRAWER_ITEM_WIDTH,
        }}>
            <View style={{
                alignItems: "center",
                borderColor: properties.selected ? palette.brand : "transparent",
                borderRadius: 31,
                borderWidth: 3,
                height: 62,
                justifyContent: "center",
                width: 62,
            }}>
                {artwork}
            </View>
            <Text ellipsizeMode="tail" numberOfLines={1} style={{
                color: properties.selected ? palette.brand : palette.normal,
                fontSize: 11,
                fontWeight: properties.selected ? "700" : "500",
                marginTop: 4,
                textAlign: "center",
                width: 68,
            }}>
                {properties.directMessage.name}
            </Text>
        </Pressable>;
    }
    function DragPreview(properties: {
        readonly item: DirectMessage | DrawerNode;
        readonly layout: DrawerLayout;
        readonly width: number;
    }): any {
        const palette = usePalette();
        const node = "kind" in properties.item ? properties.item : undefined;
        const directMessage = properties.item as DirectMessage;
        const label = node
            ? node.kind === "guild" ? node.name : node.name ?? "Folder"
            : directMessage.name;
        const artwork = node
            ? node.kind === "guild"
                ? <GuildArtwork guild={node} size={DRAWER_ICON_SIZE} />
                : <FolderArtwork folder={node} size={DRAWER_ICON_SIZE} />
            : <DirectMessageArtwork directMessage={directMessage} size={DRAWER_ICON_SIZE} />;
        if (properties.layout === "list") {
            return <View style={{
                alignItems: "center",
                backgroundColor: palette.surface,
                borderColor: palette.border,
                borderRadius: 14,
                borderWidth: 1,
                elevation: 18,
                flexDirection: "row",
                gap: 14,
                height: 68,
                paddingHorizontal: 10,
                shadowColor: "#000000",
                shadowOffset: { height: 8, width: 0 },
                shadowOpacity: 0.35,
                shadowRadius: 12,
                width: properties.width,
            }}>
                <View style={{ height: DRAWER_ICON_SIZE, position: "relative", width: DRAWER_ICON_SIZE }}>
                    {artwork}
                    <Badge node={properties.item} />
                </View>
                <Text numberOfLines={1} style={{ color: palette.normal, flex: 1, fontSize: 16, fontWeight: "700" }}>
                    {label}
                </Text>
            </View>;
        }
        return <View style={{
            alignItems: "center",
            backgroundColor: palette.surface,
            borderColor: palette.border,
            borderRadius: 20,
            borderWidth: 1,
            elevation: 18,
            minHeight: 82,
            paddingTop: 5,
            shadowColor: "#000000",
            shadowOffset: { height: 8, width: 0 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
            width: DRAWER_ITEM_WIDTH,
        }}>
            <View style={{ height: DRAWER_ICON_SIZE, position: "relative", width: DRAWER_ICON_SIZE }}>
                {artwork}
                <Badge node={properties.item} />
            </View>
            <Text ellipsizeMode="tail" numberOfLines={1} style={{
                color: palette.normal,
                fontSize: 11,
                fontWeight: "700",
                marginTop: 4,
                textAlign: "center",
                width: 60,
            }}>
                {label}
            </Text>
        </View>;
    }
    function FolderTitle({ folder, style }: { folder: DrawerFolder; style: any }): any {
        const palette = usePalette();
        const [editing, setEditing] = gestureHooks.useState(false);
        const [name, setName] = gestureHooks.useState(folder.name ?? "");
        const [error, setError] = gestureHooks.useState(false);
        const saving = gestureHooks.useRef(false);
        const save = (): void => {
            if (saving.current) return;
            saving.current = true;
            try {
                if (name.trim() !== (folder.name ?? "") && !controller.renameFolder?.(folder.id, name)) {
                    setError(true);
                    return;
                }
                setEditing(false);
                setError(false);
            } catch { setError(true); }
            finally { saving.current = false; }
        };
        if (editing && TextInput) return <View style={style}>
            <TextInput accessibilityLabel="Folder name" autoFocus selectTextOnFocus maxLength={100}
                value={name} onChangeText={setName} onSubmitEditing={save} onBlur={save} returnKeyType="done"
                style={{ color: palette.normal, fontSize: 20, padding: 4, borderBottomWidth: 1, borderColor: palette.brand }} />
            {error ? <Text style={{ color: palette.normal, fontSize: 12 }}>Could not rename folder. Try again.</Text> : null}
        </View>;
        return <Pressable accessibilityRole="button" accessibilityLabel={`Rename folder: ${folder.name ?? "Folder"}`}
            onPress={() => { setName(folder.name ?? ""); setError(false); setEditing(true); }} style={style}>
            <Text numberOfLines={1} style={{ color: palette.normal, fontSize: 20, fontWeight: "700" }}>{folder.name || "Folder"}</Text>
        </Pressable>;
    }
    return function ServerDrawerSurface(properties: Record<string, unknown>): any {
        const openGuildMenu = api.useGuildMenu(signal);
        const palette = usePalette();
        const bottomInset = Math.max(0, finite(properties.bottomInset));
        const stored = hooks.useMemo(initialPreferences, []);
        const [dmOrder, setDmOrder] = hooks.useState<readonly string[]>(stored.dmOrder);
        const [dragPoint, setDragPoint] = hooks.useState<DragPoint | undefined>(undefined);
        const [overExitTarget, setOverExitTarget] = hooks.useState(false);
        const [mergeTargetId, setMergeTargetId] = hooks.useState<string | undefined>(undefined);
        const [dragTargetId, setDragTargetId] = hooks.useState<string | undefined>(undefined);
        const [draggingId, setDraggingId] = hooks.useState<string | undefined>(undefined);
        const [expanded, setExpanded] = hooks.useState(false);
        const [filter, setFilter] = hooks.useState<"all" | "unread">("all");
        const [folderPage, setFolderPage] = hooks.useState(0);
        const [folderId, setFolderId] = hooks.useState<string | undefined>(undefined);
        const [folderOverlayId, setFolderOverlayId] = hooks.useState<string | undefined>(undefined);
        const [layout, setLayout] = hooks.useState<DrawerLayout>(stored.layout);
        const [query, setQuery] = hooks.useState("");
        const [revision, setRevision] = hooks.useState(0);
        const [serverOrder, setServerOrder] = hooks.useState<readonly string[]>(stored.serverOrder);
        const [view, setView] = hooks.useState<DrawerView>("servers");
        const [viewportHeight, setViewportHeight] = hooks.useState(initialWindowHeight);
        const [viewportWidth, setViewportWidth] = hooks.useState(initialWindowWidth);
        const [dragHeight, setDragHeight] = hooks.useState<number | undefined>(undefined);
        const dragPosition = hooks.useRef<DragPoint | undefined>(undefined);
        const floatingPreviewHandle = hooks.useRef<NativeDragPreview | null>(null);
        const gesture = hooks.useRef<GestureState | undefined>(undefined);
        const pendingDmOrder = hooks.useRef<readonly string[] | undefined>(undefined);
        const pendingServerOrder = hooks.useRef<readonly string[] | undefined>(undefined);
        const reorder = hooks.useRef<ReorderState | undefined>(undefined);
        const exitTarget = hooks.useRef<{ measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void } | null>(null);
        const exitBounds = hooks.useRef<DropBounds | undefined>(undefined);
        const measureExitTarget = (): void => {
            const target = exitTarget.current;
            exitBounds.current = undefined;
            target?.measureInWindow((x, y, width, height) => {
                if (exitTarget.current === target) exitBounds.current = { x, y, width, height };
            });
        };
        const suppressedPresses = hooks.useRef(new Set<string>());
        const folderPager = hooks.useRef<{ scrollTo?:(options: Readonly<Record<string, unknown>>) => void } | null>(null);
        const scrollY = hooks.useRef(0);
        const refresh = hooks.useCallback((): void => setRevision(previous => previous + 1), []);
        const refreshPreferences = hooks.useCallback((): void => {
            try {
                const next = preferences.get();
                setDmOrder(normalizedOrder(next.dmOrder));
                setLayout(normalizedLayout(next.layout));
                setServerOrder(normalizedOrder(next.serverOrder));
            } catch {}
        }, [preferences]);
        useAbortableSubscription(hooks, signal, controller.subscribe, refresh);
        useAbortableSubscription(hooks, signal, preferences.subscribe, refreshPreferences);
        const model = hooks.useMemo(() => {
            let snapshot = EMPTY_SNAPSHOT;
            try {
                snapshot = controller.snapshot();
            } catch {}
            let nodes: readonly DrawerNode[] = Object.freeze([]);
            try {
                nodes = parseGuildTree(snapshot.tree, {
                    readState: guildId => controller.readState(guildId),
                    resolveGuild: guildId => controller.resolveGuild(guildId),
                });
            } catch {}
            return { nodes, snapshot };
        }, [controller, revision]);
        const nodes = orderedNodes(model.nodes, serverOrder);
        const directMessages = orderedByIds((model.snapshot.privateChannels ?? []).map(channel => {
            let state: GuildReadState = { mentions: 0, unread: false };
            try {
                state = controller.readPrivateChannelState?.(channel.id) ?? state;
            } catch {}
            const mentions = typeof state.mentions === "number" && Number.isFinite(state.mentions)
                ? Math.max(0, Math.floor(state.mentions))
                : 0;
            const unread = state.unread === true;
            const mentionLabel = mentions > 0
                ? mentions > 99 ? "99+" : String(mentions)
                : undefined;
            return Object.freeze({
                ...channel,
                mentionLabel,
                mentions,
                unread,
            });
        }), dmOrder);
        const selectedGuildId = model.snapshot.selectedGuildId;
        const selectedPrivateChannelId = model.snapshot.selectedPrivateChannelId;
        const dockSpecs = computeGuildDockSpecs(viewportWidth);
        const availableDrawerHeight = Math.max(
            dockSpecs.dockHeight,
            viewportHeight - bottomInset - DRAWER_MIN_INSET,
        );
        const drawerHeight = Math.max(
            dockSpecs.dockHeight,
            Math.min(DRAWER_MAX_HEIGHT, availableDrawerHeight < DRAWER_MIN_HEIGHT
                ? availableDrawerHeight
                : Math.max(DRAWER_MIN_HEIGHT, availableDrawerHeight)),
        );
        const currentHeight = dragHeight ?? (expanded ? drawerHeight : dockSpecs.dockHeight);
        const drawerVisible = expanded || currentHeight > DRAWER_TRANSITION_HEIGHT;
        const panelWidth = drawerVisible ? Math.min(DOCK_MAX_WIDTH, viewportWidth) : dockSpecs.dockWidth;
        const panelLeft = Math.max(0, Math.round((viewportWidth - panelWidth) / 2));
        const drawerFolder = folderId === undefined
            ? undefined
            : nodes.find((node): node is DrawerFolder => node.kind === "folder" && node.id === folderId);
        const overlayFolder = folderOverlayId === undefined
            ? undefined
            : nodes.find((node): node is DrawerFolder => node.kind === "folder" && node.id === folderOverlayId);
        const compactItems = buildCompactDockItems(nodes, dockSpecs);
        const visibleServers = filteredNodes(nodes, filter, query, drawerFolder);
        const search = normalizedQuery(query);
        const visibleDms = directMessages.filter(directMessage => (
            (!search || directMessage.name.toLocaleLowerCase().includes(search))
            && (filter === "all" || directMessage.unread)
        ));
        const visible = view === "servers" ? visibleServers : visibleDms;
        const visibleIds = visible.map(item => item.id);
        const columns = layout === "grid"
            ? Math.max(3, Math.floor(
                (panelWidth - DRAWER_SIDE_PADDING * 2 + DRAWER_GAP)
                / (DRAWER_ITEM_WIDTH + DRAWER_GAP),
            ))
            : 1;
        const gridColumnGap = columns > 1
            ? Math.max(
                DRAWER_GAP,
                (panelWidth - DRAWER_SIDE_PADDING * 2 - columns * DRAWER_ITEM_WIDTH) / (columns - 1),
            )
            : 0;
        const previewWidth = layout === "grid" ? DRAWER_ITEM_WIDTH : Math.max(1, panelWidth - 20);
        const previewTransform = (point: DragPoint): readonly Readonly<Record<string, unknown>>[] => (
            layout === "grid"
                ? [
                    { translateX: point.x },
                    { translateY: point.y },
                    { translateX: -previewWidth / 2 },
                    { translateY: -41 },
                    { translateY: -7 },
                    { scale: 1.07 },
                ]
                : [
                    { translateY: point.y },
                    { translateY: -34 },
                    { translateY: -7 },
                    { scale: 1.025 },
                ]
        );
        hooks.useEffect(() => {
            if (folderId && !drawerFolder) setFolderId(undefined);
            if (folderOverlayId && !overlayFolder) setFolderOverlayId(undefined);
        }, [drawerFolder, folderId, folderOverlayId, overlayFolder]);
        hooks.useEffect(() => {
            scrollY.current = 0;
        }, [filter, folderId, layout, query]);
        hooks.useEffect(() => {
            setFolderPage(0);
        }, [folderOverlayId]);
        hooks.useEffect(() => {
            if ((!expanded && !folderId && !folderOverlayId) || signal.aborted || !controller.addBackHandler) {
                return () => undefined;
            }
            const close = (): boolean => {
                if (folderOverlayId) {
                    setFolderOverlayId(undefined);
                } else if (folderId) {
                    setFolderId(undefined);
                } else {
                    try {
                        controller.animateNext?.();
                    } catch {}
                    setExpanded(false);
                    setDragHeight(undefined);
                }
                return true;
            };
            let cleanup: Unpatch = once(() => undefined);
            try {
                cleanup = once(controller.addBackHandler(close) ?? (() => undefined));
            } catch {}
            const abort = (): void => cleanup();
            signal.addEventListener("abort", abort, { once: true });
            if (signal.aborted) cleanup();
            return () => {
                signal.removeEventListener("abort", abort);
                cleanup();
            };
        }, [controller, expanded, folderId, folderOverlayId, signal]);
        if (signal.aborted) return null;
        const setDrawerOpen = (open: boolean): void => {
            try {
                controller.animateNext?.();
            } catch {}
            try {
                controller.haptic?.();
            } catch {}
            setExpanded(open);
            setDragHeight(undefined);
            if (!open) {
                setFolderId(undefined);
                setQuery("");
                scrollY.current = 0;
            }
        };
        const selectGuild = (guild: DrawerGuild): void => {
            setFolderOverlayId(undefined);
            let selected = false;
            try {
                selected = controller.selectGuild(guild.id);
            } catch {}
            if (selected && (expanded || drawerVisible)) setDrawerOpen(false);
        };
        const selectDirectMessage = (directMessage: DirectMessage): void => {
            let selected = false;
            try {
                selected = controller.selectPrivateChannel?.(directMessage.id) === true;
            } catch {}
            if (selected && (expanded || drawerVisible)) setDrawerOpen(false);
        };
        const consumeSuppressedPress = (itemView: DrawerView, id: string): boolean => {
            const key = `${itemView}:${id}`;
            if (!suppressedPresses.current.has(key)) return false;
            suppressedPresses.current.delete(key);
            return true;
        };
        const beginReorder = (
            itemView: DrawerView,
            id: string,
            event: unknown,
            ids: readonly string[],
            itemColumns = columns,
            columnStep = DRAWER_ITEM_WIDTH + gridColumnGap,
            rowStep?: number,
        ): boolean => {
            const startX = eventCoordinate(event, "pageX");
            const startY = eventCoordinate(event, "pageY");
            const sourceIndex = ids.indexOf(id);
            if (startX === undefined || startY === undefined || sourceIndex < 0) return false;
            gesture.current = undefined;
            measureExitTarget();
            setOverExitTarget(false);
            reorder.current = {
                columnStep,
                columns: itemColumns,
                ids,
                initialOrder: itemView === "servers" ? serverOrder : dmOrder,
                layout: folderOverlayId ? "grid" : layout,
                rowStep: rowStep ?? (layout === "grid" ? 82 + DRAWER_GAP : 72),
                sourceId: id,
                sourceFolderId: itemView === "servers" ? guildsInTreeOrder(nodes).find(guild => guild.id === id)?.folderId : undefined,
                sourceIndex,
                startX,
                startY,
                targetId: id,
                view: itemView,
            };
            suppressedPresses.current.add(`${itemView}:${id}`);
            pendingDmOrder.current = undefined;
            pendingServerOrder.current = undefined;
            const point = { x: startX, y: startY };
            dragPosition.current = point;
            setDragPoint(point);
            setDragTargetId(id);
            try {
                controller.animateNext?.(90);
            } catch {}
            setDraggingId(`${itemView}:${id}`);
            try {
                controller.haptic?.("medium");
            } catch {}
            return true;
        };
        const moveReorder = (event: unknown): boolean => {
            const active = reorder.current;
            if (!active) return false;
            const x = eventCoordinate(event, "pageX");
            const y = eventCoordinate(event, "pageY");
            if (x === undefined || y === undefined) return true;
            const point = { x, y };
            if (Math.hypot(x - active.startX, y - active.startY) > 10) active.moved = true;
            dragPosition.current = point;
            try {
                floatingPreviewHandle.current?.setNativeProps?.({ style: { transform: previewTransform(point) } });
            } catch {}
            active.removeFromFolder = active.view === "servers" && !!active.sourceFolderId
                && !!exitTarget.current && hitsDropTarget(point, exitBounds.current);
            setOverExitTarget(active.removeFromFolder);
            if (active.removeFromFolder) {
                active.mergeSince = undefined;
                active.targetId = active.sourceId;
                pendingServerOrder.current = undefined;
                setMergeTargetId(undefined);
                setDragTargetId(active.sourceId);
                return true;
            }
            const indexDelta = active.layout === "grid"
                ? Math.round((x - active.startX) / active.columnStep)
                    + Math.round((y - active.startY) / active.rowStep) * active.columns
                : Math.round((y - active.startY) / active.rowStep);
            const targetIndex = Math.max(0, Math.min(active.ids.length - 1, active.sourceIndex + indexDelta));
            const targetId = active.ids[targetIndex];
            const sourceGuild = guildsInTreeOrder(nodes).find(guild => guild.id === active.sourceId);
            const targetGuild = guildsInTreeOrder(nodes).find(guild => guild.id === targetId);
            const targetFolder = nodes.find(node => node.kind === "folder" && node.id === targetId);
            const columnDelta = targetIndex % active.columns - active.sourceIndex % active.columns;
            const rowDelta = Math.floor(targetIndex / active.columns) - Math.floor(active.sourceIndex / active.columns);
            const centered = active.layout === "grid"
                ? Math.abs(x - active.startX - columnDelta * active.columnStep) < 22
                    && Math.abs(y - active.startY - rowDelta * active.rowStep) < 22
                : Math.abs(y - active.startY - (targetIndex - active.sourceIndex) * active.rowStep) < 20;
            const canMerge = active.view === "servers" && sourceGuild && targetId !== active.sourceId && centered
                && (targetFolder ? sourceGuild.folderId !== targetId : targetGuild && (!sourceGuild.folderId || sourceGuild.folderId !== targetGuild.folderId));
            active.mergeSince = canMerge ? active.targetId === targetId ? active.mergeSince ?? Date.now() : Date.now() : undefined;
            setMergeTargetId(canMerge ? targetId : undefined);
            if (!targetId || targetId === active.targetId) return true;
            active.targetId = targetId;
            setDragTargetId(targetId);
            try {
                controller.animateNext?.(90);
            } catch {}
            if (active.view === "servers") {
                const next = movedOrder(
                    active.initialOrder,
                    nodeIds(nodes),
                    active.sourceId,
                    targetId,
                );
                pendingServerOrder.current = next;
            } else {
                const next = movedOrder(
                    active.initialOrder,
                    directMessages.map(directMessage => directMessage.id),
                    active.sourceId,
                    targetId,
                );
                pendingDmOrder.current = next;
            }
            return true;
        };
        const finishReorder = (showMenu = false): boolean => {
            const active = reorder.current;
            if (!active) return false;
            reorder.current = undefined;
            try {
                controller.animateNext?.(110);
                controller.haptic?.();
            } catch {}
            dragPosition.current = undefined;
            setDragPoint(undefined);
            setDragTargetId(undefined);
            setMergeTargetId(undefined);
            setDraggingId(undefined);
            setOverExitTarget(false);
            if (showMenu && active.view === "servers" && !active.moved
                && guildsInTreeOrder(nodes).some(guild => guild.id === active.sourceId)) {
                pendingDmOrder.current = undefined;
                pendingServerOrder.current = undefined;
                openGuildMenu(active.sourceId, active.startX, active.startY);
                return true;
            }
            try {
                if (active.view === "servers") {
                    const next = pendingServerOrder.current;
                    let changed = false;
                    if (active.removeFromFolder && active.sourceFolderId) {
                        changed = controller.removeGuildFromFolder?.(active.sourceId, active.sourceFolderId) === true;
                        if (!changed) throw new Error("Folder membership changed during drag");
                    } else if (next && active.sourceId !== active.targetId) {
                        const merge = active.mergeSince !== undefined && (active.layout === "grid" || Date.now() - active.mergeSince >= 450);
                        changed = (merge ? controller.dropGuild?.(active.sourceId, active.targetId)
                            : controller.moveGuild?.(active.sourceId, active.targetId)) === true;
                        if (!changed) throw new Error("Drop target is no longer available");
                    }
                    if (changed) {
                        setServerOrder([]);
                        preferences.update({ serverOrder: [] });
                    }
                } else if (pendingDmOrder.current) {
                    preferences.update({ dmOrder: pendingDmOrder.current });
                    setDmOrder(pendingDmOrder.current);
                }
            } catch (error) { reportActionFailure("move this item", error); }
            pendingDmOrder.current = undefined;
            pendingServerOrder.current = undefined;
            return true;
        };
        const cancelReorder = (): boolean => {
            const active = reorder.current;
            if (!active) return false;
            reorder.current = undefined;
            try {
                controller.animateNext?.(110);
            } catch {}
            pendingDmOrder.current = undefined;
            pendingServerOrder.current = undefined;
            dragPosition.current = undefined;
            setDragPoint(undefined);
            setDragTargetId(undefined);
            setMergeTargetId(undefined);
            setDraggingId(undefined);
            setOverExitTarget(false);
            return true;
        };
        const reorderOffset = (itemView: DrawerView, id: string): DragPoint | undefined => {
            if (mergeTargetId) return undefined;
            const active = reorder.current;
            if (!active || active.view !== itemView || active.sourceId === id) return undefined;
            // Keep grid drop targets fixed so reordering cannot move a folder target away from the finger.
            if (active.layout === "grid") return undefined;
            const itemIndex = active.ids.indexOf(id);
            const targetIndex = active.ids.indexOf(dragTargetId ?? active.targetId);
            if (itemIndex < 0 || targetIndex < 0 || targetIndex === active.sourceIndex) return undefined;
            const indexShift = active.sourceIndex < targetIndex
                ? itemIndex > active.sourceIndex && itemIndex <= targetIndex ? -1 : 0
                : itemIndex >= targetIndex && itemIndex < active.sourceIndex ? 1 : 0;
            if (indexShift === 0) return undefined;
            return { x: 0, y: indexShift * active.rowStep };
        };
        const changeView = (next: DrawerView): void => {
            if (view === next) return;
            finishReorder();
            setFolderId(undefined);
            setFolderOverlayId(undefined);
            setQuery("");
            setView(next);
            try {
                controller.haptic?.();
            } catch {}
        };
        const openFolderOverlay = (folder: DrawerFolder): void => {
            try {
                controller.haptic?.();
            } catch {}
            setFolderOverlayId(folder.id);
        };
        const beginGesture = (event: unknown): void => {
            if (reorder.current) return;
            // Suppress only the release of the previous hold/drag, never a new touch.
            suppressedPresses.current.clear();
            const x = eventCoordinate(event, "pageX");
            const y = eventCoordinate(event, "pageY");
            if (x === undefined || y === undefined) {
                gesture.current = undefined;
                return;
            }
            const now = Date.now();
            gesture.current = {
                claimed: false,
                height: expanded ? drawerHeight : dockSpecs.dockHeight,
                lastAt: now,
                lastY: y,
                velocity: 0,
                x,
                y,
            };
        };
        const moveGesture = (event: unknown): void => {
            if (moveReorder(event)) return;
            const active = gesture.current;
            const y = eventCoordinate(event, "pageY");
            if (!active || y === undefined) return;
            const distance = y - active.y;
            if (!active.claimed) {
                const opens = !expanded && distance < -SWIPE_DISTANCE;
                // The native drawer runs simultaneously with its scroller. A plain RN responder
                // cannot arbitrate that safely, so only claim the useful close direction at top.
                const movesDrawer = expanded && distance > SWIPE_DISTANCE && scrollY.current <= 0;
                if (!opens && !movesDrawer) {
                    if (Math.abs(distance) > SWIPE_DISTANCE) gesture.current = undefined;
                    return;
                }
                active.claimed = true;
            }
            const now = Date.now();
            active.velocity = (y - active.lastY) / Math.max(1, now - active.lastAt) * 1_000;
            active.lastAt = now;
            active.lastY = y;
            const nextHeight = Math.max(
                dockSpecs.dockHeight,
                Math.min(drawerHeight, active.height - distance),
            );
            setDragHeight(nextHeight);
        };
        const endGesture = (event: unknown): void => {
            if (reorder.current) moveReorder(event);
            if (finishReorder(true)) return;
            const active = gesture.current;
            gesture.current = undefined;
            if (!active?.claimed) {
                setDragHeight(undefined);
                return;
            }
            const y = eventCoordinate(event, "pageY") ?? active.lastY;
            const now = Date.now();
            const finalDelta = y - active.lastY;
            const velocity = Math.abs(finalDelta) > 0.5
                ? finalDelta / Math.max(1, now - active.lastAt) * 1_000
                : active.velocity;
            const finalHeight = Math.max(
                dockSpecs.dockHeight,
                Math.min(drawerHeight, active.height - (y - active.y)),
            );
            const isDrawer = finalHeight > DRAWER_TRANSITION_HEIGHT;
            const open = (Math.abs(velocity) > SWIPE_VELOCITY && velocity < 0)
                || (Math.abs(velocity) < SWIPE_VELOCITY && isDrawer);
            setDrawerOpen(open);
        };
        const releaseReorder = (event: unknown): void => {
            if (!reorder.current) return;
            moveReorder(event);
            finishReorder(true);
        };
        const cancelGesture = (): void => {
            // Activating GestureDetector cancels React Native's legacy touch responder. That
            // cancellation bubbles through the drawer even though the native pan is still active;
            // its own onFinalize callback is the sole authority for cancelling a native reorder.
            if (nativeReorderAvailable && reorder.current) {
                gesture.current = undefined;
                return;
            }
            if (cancelReorder()) return;
            gesture.current = undefined;
            setDragHeight(undefined);
        };
        const changeLayout = (): void => {
            const next: DrawerLayout = layout === "grid" ? "list" : "grid";
            setLayout(next);
            try {
                preferences.update({ layout: next });
                controller.haptic?.();
            } catch {}
        };
        const openCreation = (): void => {
            let opened = false;
            try {
                opened = view === "servers"
                    ? controller.openCreateGuild?.() === true
                    : controller.openCreateDm?.() === true;
            } catch {}
            if (opened) setDrawerOpen(false);
        };
        const handle = <Pressable
            accessibilityActions={[{ label: drawerVisible ? "Collapse" : "Expand", name: "activate" }]}
            accessibilityLabel={drawerVisible ? "Collapse server drawer" : "Expand server drawer"}
            accessibilityRole="button"
            accessibilityState={{ expanded: drawerVisible }}
            hitSlop={{ bottom: 14, left: 14, right: 14, top: 14 }}
            onAccessibilityAction={() => setDrawerOpen(!drawerVisible)}
            onPress={() => setDrawerOpen(!drawerVisible)}
            style={{ alignItems: "center", height: 16, justifyContent: "center", width: "100%" }}
        >
            <View style={{ backgroundColor: palette.muted, borderRadius: 3, height: 5, opacity: 0.5, width: 38 }} />
        </Pressable>;
        const renderCompactItem = (item: CompactDockItem): any => {
            switch (item.kind) {
                case "dm":
                    return <Pressable key={item.key} accessibilityRole="button"
                        accessibilityLabel="Direct Messages"
                        onPress={() => {
                            setView("dms");
                            setFolderId(undefined);
                            setFolderOverlayId(undefined);
                            setQuery("");
                            setFilter("all");
                            setDrawerOpen(true);
                        }} style={{ alignItems: "center", justifyContent: "center", backgroundColor: palette.surface,
                            borderRadius: 16, height: dockSpecs.itemSize, width: dockSpecs.itemSize }}>
                        <ChatIcon color={palette.normal} />
                    </Pressable>;
                case "guild":
                    return <CompactGuild
                        guild={item.guild}
                        key={item.key}
                        onPress={() => selectGuild(item.guild)}
                        onLongPress={event => openGuildMenu(item.guild.id, eventCoordinate(event, "pageX") ?? viewportWidth / 2, eventCoordinate(event, "pageY") ?? viewportHeight / 2)}
                        selected={item.guild.id === selectedGuildId}
                        size={dockSpecs.itemSize}
                    />;
                case "folder":
                    return <CompactFolder
                        folder={item.folder}
                        key={item.key}
                        onPress={() => openFolderOverlay(item.folder)}
                        size={dockSpecs.itemSize}
                    />;
                case "create":
                    return <CreateButton
                        key={item.key}
                        onPress={() => {
                            try {
                                controller.openCreateGuild?.();
                            } catch {}
                        }}
                        size={dockSpecs.itemSize}
                    />;
                case "unavailable":
                    return <UnavailableButton
                        count={item.count}
                        key={item.key}
                        size={dockSpecs.itemSize}
                    />;
                case "overflow":
                    return <OverflowButton key={item.key} onPress={() => setDrawerOpen(true)} size={dockSpecs.itemSize} />;
                case "divider":
                    return <View key={item.key} style={{
                        alignSelf: "center",
                        backgroundColor: palette.border,
                        height: Math.round(dockSpecs.itemSize * 0.7),
                        marginHorizontal: -5.5,
                        width: 1,
                    }} />;
                case "spacer":
                    return <View
                        accessibilityElementsHidden={true}
                        importantForAccessibility="no-hide-descendants"
                        key={item.key}
                        style={{ height: dockSpecs.itemSize, opacity: 0, width: dockSpecs.itemSize }}
                    />;
            }
        };
        const compactContent = <View style={{ flex: 1 }}>
            {handle}
            <View style={{
                alignItems: "center",
                flexDirection: "row",
                gap: 10,
                height: dockSpecs.itemSize,
                paddingHorizontal: 20,
            }}>
                {compactItems.map(renderCompactItem)}
            </View>
        </View>;
        const renderServerItem = (node: DrawerNode): any => {
            const offset = reorderOffset("servers", node.id);
            const item = <DrawerItem
                merging={mergeTargetId === node.id}
                dragging={draggingId === `servers:${node.id}`}
                layout={layout}
                nativeReorder={nativeReorderAvailable}
                node={node}
                onFolder={folder => {
                    if (!consumeSuppressedPress("servers", folder.id)) setFolderId(folder.id);
                }}
                onGuild={guild => {
                    if (!consumeSuppressedPress("servers", guild.id)) selectGuild(guild);
                }}
                onLongPress={(event: unknown) => beginReorder("servers", node.id, event, visibleIds)}
                onPressOut={releaseReorder}
                onTouchCancel={cancelGesture}
                onTouchEnd={endGesture}
                onTouchMove={moveReorder}
                selectedGuildId={selectedGuildId}
            />;
            return nativeReorderAvailable
                ? <NativeReorderTarget
                    offset={offset}
                    onCancel={cancelReorder}
                    onDrop={releaseReorder}
                    onMove={moveReorder}
                    onStart={(event: unknown) => beginReorder("servers", node.id, event, visibleIds)}
                >
                    {item}
                </NativeReorderTarget>
                : <View style={offset
                    ? { transform: [{ translateX: offset.x }, { translateY: offset.y }] }
                    : undefined}
                >
                    {item}
                </View>;
        };
        const renderDirectMessageItem = (directMessage: DirectMessage): any => {
            const offset = reorderOffset("dms", directMessage.id);
            const item = <DirectMessageItem
                directMessage={directMessage}
                dragging={draggingId === `dms:${directMessage.id}`}
                layout={layout}
                nativeReorder={nativeReorderAvailable}
                onLongPress={(event: unknown) => beginReorder("dms", directMessage.id, event, visibleIds)}
                onPress={() => {
                    if (!consumeSuppressedPress("dms", directMessage.id)) selectDirectMessage(directMessage);
                }}
                onPressOut={releaseReorder}
                onTouchCancel={cancelGesture}
                onTouchEnd={endGesture}
                onTouchMove={moveReorder}
                selected={directMessage.id === selectedPrivateChannelId}
            />;
            return nativeReorderAvailable
                ? <NativeReorderTarget
                    offset={offset}
                    onCancel={cancelReorder}
                    onDrop={releaseReorder}
                    onMove={moveReorder}
                    onStart={(event: unknown) => beginReorder("dms", directMessage.id, event, visibleIds)}
                >
                    {item}
                </NativeReorderTarget>
                : <View style={offset
                    ? { transform: [{ translateX: offset.x }, { translateY: offset.y }] }
                    : undefined}
                >
                    {item}
                </View>;
        };
        const renderItem = (entry: unknown): any => {
            const item = (entry as { item?: DrawerNode | DirectMessage } | undefined)?.item;
            if (!item) return null;
            return view === "servers"
                ? renderServerItem(item as DrawerNode)
                : renderDirectMessageItem(item as DirectMessage);
        };
        const contentStyle = layout === "grid"
            ? {
                columnGap: gridColumnGap,
                paddingBottom: 40,
                paddingHorizontal: DRAWER_SIDE_PADDING,
                paddingTop: 14,
                rowGap: DRAWER_GAP,
            }
            : { gap: 4, paddingBottom: 40, paddingHorizontal: 10, paddingTop: 10 };
        const empty = <View style={{ alignItems: "center", justifyContent: "center", minHeight: 180, padding: 24 }}>
            <Text style={{ color: palette.normal, fontSize: 17, fontWeight: "600", textAlign: "center" }}>
                {query.trim()
                    ? `No ${view === "servers" ? "servers" : "direct messages"} match your search`
                    : filter === "unread"
                        ? "You're all caught up"
                        : `No ${view === "servers" ? "servers" : "direct messages"} to show`}
            </Text>
        </View>;
        const list = FlatList
            ? <FlatList
                columnWrapperStyle={columns > 1 ? { gap: gridColumnGap } : undefined}
                contentContainerStyle={contentStyle}
                data={visible}
                initialNumToRender={20}
                key={`${view}-${layout}-${columns}-${drawerFolder?.id ?? "root"}`}
                keyExtractor={(item: DrawerNode | DirectMessage) => `${view}:${item.id}`}
                ListEmptyComponent={empty}
                maxToRenderPerBatch={20}
                numColumns={columns}
                onScroll={(event: unknown) => { scrollY.current = scrollOffset(event); }}
                renderItem={renderItem}
                scrollEventThrottle={16}
                scrollEnabled={draggingId === undefined}
                showsVerticalScrollIndicator={false}
                style={{ flex: 1 }}
                windowSize={7}
            />
            : <ScrollView
                contentContainerStyle={{
                    ...contentStyle,
                    flexDirection: layout === "grid" ? "row" : "column",
                    flexWrap: layout === "grid" ? "wrap" : "nowrap",
                }}
                onScroll={(event: unknown) => { scrollY.current = scrollOffset(event); }}
                scrollEventThrottle={16}
                scrollEnabled={draggingId === undefined}
                showsVerticalScrollIndicator={false}
                style={{ flex: 1 }}
            >
                {visible.length > 0
                    ? view === "servers"
                        ? visibleServers.map(node => <View key={node.id}>{renderServerItem(node)}</View>)
                        : visibleDms.map(directMessage => (
                            <View key={directMessage.id}>{renderDirectMessageItem(directMessage)}</View>
                        ))
                    : empty}
            </ScrollView>;
        const renderExitTarget = (): any => <View
            ref={exitTarget} collapsable={false} onLayout={measureExitTarget} pointerEvents="none"
            accessible accessibilityRole="image" accessibilityLabel="Move server out of folder"
            accessibilityHint="Drag a server onto this arrow and release to make it standalone"
            style={{ alignItems: "center", justifyContent: "center", width: 56, height: 56,
                position: "absolute", left: viewportWidth / 2 - 28, bottom: bottomInset + 24,
                zIndex: 110, elevation: 65 }}>
            <Text style={{ color: overExitTarget ? palette.brand : palette.normal, fontSize: 36, lineHeight: 42,
                transform: [{ scale: overExitTarget ? 1.15 : 1 }] }}>↶</Text>
        </View>;
        const drawerContent = <View style={{ flex: 1 }}>
            {handle}
            <View style={{ alignItems: "center", flexDirection: "row", minHeight: 50, paddingHorizontal: 12 }}>
                {drawerFolder
                    ? <Pressable
                        accessibilityLabel="Back to all servers"
                        accessibilityRole="button"
                        onPress={() => setFolderId(undefined)}
                        style={{ alignItems: "center", height: 44, justifyContent: "center", width: 44 }}
                    >
                        <Text style={{ color: palette.normal, fontSize: 30 }}>‹</Text>
                    </Pressable>
                    : null}
                {drawerFolder
                    ? <FolderTitle key={drawerFolder.id} folder={drawerFolder} style={{ flex: 1, paddingVertical: 8 }} />
                    : <View accessibilityRole="tablist" style={{
                        backgroundColor: palette.input,
                        borderRadius: 10,
                        flex: 1,
                        flexDirection: "row",
                        padding: 3,
                    }}>
                        {(["servers", "dms"] as const).map(value => {
                            const selected = view === value;
                            const label = value === "servers" ? "Servers" : "Direct Messages";
                            return <Pressable
                                accessibilityLabel={label}
                                accessibilityRole="tab"
                                accessibilityState={{ selected }}
                                key={value}
                                onPress={() => changeView(value)}
                                style={{
                                    alignItems: "center",
                                    backgroundColor: selected ? palette.surface : "transparent",
                                    borderRadius: 8,
                                    flex: 1,
                                    justifyContent: "center",
                                    minHeight: 36,
                                    paddingHorizontal: 5,
                                }}
                            >
                                <Text numberOfLines={1} style={{
                                    color: selected ? palette.normal : palette.muted,
                                    fontSize: 13,
                                    fontWeight: selected ? "700" : "500",
                                }}>
                                    {label}
                                </Text>
                            </Pressable>;
                        })}
                    </View>}
                <Pressable
                    accessibilityLabel={`Switch to ${layout === "grid" ? "list" : "grid"} view`}
                    accessibilityRole="button"
                    onPress={changeLayout}
                    style={{ alignItems: "center", height: 44, justifyContent: "center", width: 44 }}
                >
                    <HeaderLayoutIcon layout={layout} />
                </Pressable>
                {(view === "servers" ? controller.openCreateGuild : controller.openCreateDm)
                    ? <Pressable
                        accessibilityLabel={view === "servers" ? "Create a server" : "Start a direct message"}
                        accessibilityRole="button"
                        onPress={openCreation}
                        style={{ alignItems: "center", height: 44, justifyContent: "center", width: 44 }}
                    >
                        <HeaderAddIcon />
                    </Pressable>
                    : null}
            </View>
            <View style={{ gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
                {TextInput
                    ? <TextInput
                        accessibilityLabel={view === "servers" ? "Search servers" : "Search direct messages"}
                        onChange={(value: unknown) => {
                            const text = changedText(value);
                            if (text !== undefined) setQuery(text);
                        }}
                        onChangeText={setQuery}
                        placeholder={view === "servers" ? "Search servers" : "Search direct messages"}
                        placeholderTextColor={palette.muted}
                        returnKeyType="search"
                        style={{ backgroundColor: palette.input, color: palette.normal, minHeight: 42, paddingHorizontal: 12, borderRadius: 8 }}
                        value={query}
                    />
                    : null}
                <View accessibilityRole="tablist" style={{
                    backgroundColor: palette.input,
                    borderRadius: 9,
                    flexDirection: "row",
                    padding: 3,
                }}>
                    {(["all", "unread"] as const).map(value => {
                        const selected = filter === value;
                        return <Pressable
                            accessibilityLabel={(value === "all" ? "All " : "Unread ")
                                + (view === "servers" ? "servers" : "direct messages")}
                            accessibilityRole="tab"
                            accessibilityState={{ selected }}
                            key={value}
                            onPress={() => setFilter(value)}
                            style={{
                                alignItems: "center",
                                backgroundColor: selected ? palette.surface : "transparent",
                                borderRadius: 7,
                                flex: 1,
                                justifyContent: "center",
                                minHeight: 36,
                            }}
                        >
                            <Text style={{
                                color: selected ? palette.normal : palette.muted,
                                fontSize: 14,
                                fontWeight: selected ? "700" : "500",
                            }}>
                                {value === "all" ? "All" : "Unreads"}
                            </Text>
                        </Pressable>;
                    })}
                </View>
            </View>
            {list}
        </View>;
        let folderOverlay: any = null;
        if (overlayFolder) {
            const folderHeight = Math.min(360, Math.max(240, viewportHeight - bottomInset - 64));
            const pageSize = 3 * Math.max(1, Math.floor((folderHeight - 78) / 90));
            const pages: DrawerGuild[][] = [];
            for (let index = 0; index < overlayFolder.children.length; index += pageSize) {
                pages.push(overlayFolder.children.slice(index, index + pageSize));
            }
            const folderSize = Math.min(320, Math.max(240, viewportWidth - 32));
            folderOverlay = <Pressable
                accessibilityLabel="Close server folder"
                accessibilityRole="button"
                onAccessibilityEscape={() => setFolderOverlayId(undefined)}
                onPress={() => setFolderOverlayId(undefined)}
                onTouchCancel={cancelGesture}
                onTouchEnd={endGesture}
                onTouchMove={moveGesture}
                onTouchStart={beginGesture}
                style={{
                    alignItems: "center",
                    backgroundColor: "rgba(0, 0, 0, 0.82)",
                    bottom: 0,
                    justifyContent: "center",
                    left: 0,
                    position: "absolute",
                    right: 0,
                    top: 0,
                    zIndex: 60,
                }}
            >
                <Pressable
                    accessibilityLabel={overlayFolder.name ?? "Unnamed folder"}
                    accessibilityRole="summary"
                    onPress={safeStopPropagation}
                    style={{
                        alignItems: "center",
                        backgroundColor: palette.surface,
                        borderRadius: 40,
                        elevation: 45,
                        height: folderHeight,
                        overflow: "hidden",
                        width: folderSize,
                    }}
                >
                    <ScrollView
                        horizontal={true}
                        onMomentumScrollEnd={(event: unknown) => {
                            setFolderPage(Math.max(0, Math.min(
                                pages.length - 1,
                                Math.round(horizontalScrollOffset(event) / folderSize),
                            )));
                        }}
                        pagingEnabled={true}
                        ref={folderPager}
                        showsHorizontalScrollIndicator={false}
                        style={{ height: folderHeight, width: folderSize }}
                    >
                        {pages.map((page, pageIndex) => <View
                            key={`folder-page-${pageIndex}`}
                            style={{
                                alignContent: "flex-start",
                                alignItems: "center",
                                flexDirection: "row",
                                flexWrap: "wrap",
                                gap: 8,
                                height: folderHeight,
                                paddingBottom: 28,
                                paddingHorizontal: 10,
                                paddingTop: 52,
                                width: folderSize,
                            }}
                        >
                            {page.map(guild => {
                                const ids = overlayFolder.children.map(child => child.id);
                                const offset = reorderOffset("servers", guild.id);
                                const start = (event: unknown): boolean => beginReorder(
                                    "servers",
                                    guild.id,
                                    event,
                                    ids,
                                    3,
                                    DRAWER_ITEM_WIDTH + 8,
                                    82 + 8,
                                );
                                const item = <DrawerItem
                                    dragging={draggingId === `servers:${guild.id}`}
                                    layout="grid"
                                    nativeReorder={nativeReorderAvailable}
                                    node={guild}
                                    onFolder={() => undefined}
                                    onGuild={selectedGuild => {
                                        if (!consumeSuppressedPress("servers", selectedGuild.id)) selectGuild(selectedGuild);
                                    }}
                                    onLongPress={start}
                                    onPressOut={releaseReorder}
                                    onTouchCancel={cancelGesture}
                                    onTouchEnd={endGesture}
                                    onTouchMove={moveReorder}
                                    selectedGuildId={selectedGuildId}
                                />;
                                return nativeReorderAvailable
                                    ? <NativeReorderTarget
                                        key={guild.id}
                                        offset={offset}
                                        onCancel={cancelReorder}
                                        onDrop={releaseReorder}
                                        onMove={moveReorder}
                                        onStart={start}
                                    >
                                        {item}
                                    </NativeReorderTarget>
                                    : <View
                                        key={guild.id}
                                        style={offset
                                            ? { transform: [{ translateX: offset.x }, { translateY: offset.y }] }
                                            : undefined}
                                    >
                                        {item}
                                    </View>;
                            })}
                        </View>)}
                    </ScrollView>
                    <FolderTitle key={overlayFolder.id} folder={overlayFolder}
                        style={{ position: "absolute", top: 8, left: 20, right: 20 }} />
                    {pages.length > 1 ? <View pointerEvents="box-none" style={{
                        alignItems: "center",
                        bottom: 8,
                        flexDirection: "row",
                        gap: 5,
                        justifyContent: "center",
                        position: "absolute",
                    }}>
                        {pages.map((_page, index) => <Pressable
                            accessibilityLabel={`Folder page ${index + 1}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected: index === folderPage }}
                            key={`folder-dot-${index}`}
                            onPress={() => {
                                setFolderPage(index);
                                try {
                                    folderPager.current?.scrollTo?.({ animated: true, x: index * folderSize, y: 0 });
                                } catch {}
                            }}
                            style={{
                                backgroundColor: index === folderPage ? palette.normal : palette.muted,
                                borderRadius: 3,
                                height: 7,
                                marginHorizontal: 4,
                                marginVertical: 10,
                                width: 7,
                            }}
                        />)}
                    </View> : null}
                </Pressable>
            </Pressable>;
        }
        const draggedId = draggingId?.slice(draggingId.indexOf(":") + 1);
        const draggedItem = draggingId?.startsWith("servers:")
            ? nodes.find(node => node.id === draggedId)
                ?? guildsInTreeOrder(nodes).find(guild => guild.id === draggedId)
            : draggingId?.startsWith("dms:")
                ? directMessages.find(directMessage => directMessage.id === draggedId)
                : undefined;
        const draggedLabel = draggedItem
            ? "kind" in draggedItem
                ? draggedItem.kind === "guild" ? draggedItem.name : draggedItem.name ?? "Folder"
                : draggedItem.name
            : undefined;
        const currentDragPoint = dragPosition.current ?? dragPoint;
        const floatingPreview = currentDragPoint && draggedItem && draggedLabel
            ? <FloatingView
                accessibilityLabel={`Dragging ${draggedLabel}`}
                accessibilityRole="summary"
                pointerEvents="none"
                ref={floatingPreviewHandle}
                style={{
                    elevation: 60,
                    left: layout === "grid" ? 0 : panelLeft + 10,
                    position: "absolute",
                    top: 0,
                    transform: previewTransform(currentDragPoint),
                    width: previewWidth,
                    zIndex: 100,
                }}
            >
                <DragPreview item={draggedItem} layout={layout} width={previewWidth} />
            </FloatingView>
            : null;
        return <View
            onLayout={(event: unknown) => {
                const measured = eventWidth(event);
                if (measured !== undefined && measured !== viewportWidth) setViewportWidth(measured);
                const measuredHeight = eventHeight(event);
                if (measuredHeight !== undefined && measuredHeight !== viewportHeight) setViewportHeight(measuredHeight);
            }}
            pointerEvents="box-none"
            style={{
                bottom: 0,
                left: 0,
                position: "absolute",
                right: 0,
                top: 0,
                zIndex: 0,
            }}
        >
            {folderOverlay}
            <View
                accessibilityLabel={drawerVisible
                    ? view === "servers" ? "All servers drawer" : "Direct messages drawer"
                    : "Server dock"}
                accessibilityViewIsModal={drawerVisible}
                importantForAccessibility={drawerVisible ? "yes" : "auto"}
                onTouchCancel={cancelGesture}
                onTouchEnd={endGesture}
                onTouchMove={moveGesture}
                onTouchStart={beginGesture}
                style={{
                    backgroundColor: palette.background,
                    borderColor: palette.border,
                    borderRadius: 24,
                    borderWidth: 1,
                    bottom: bottomInset + (drawerVisible ? 0 : SERVER_DOCK_OFFSET),
                    elevation: 0,
                    height: currentHeight,
                    left: panelLeft,
                    overflow: "hidden",
                    position: "absolute",
                    width: panelWidth,
                    zIndex: 0,
                }}
            >
                {drawerVisible ? drawerContent : compactContent}
            </View>
            {floatingPreview}
            {draggingId?.startsWith("servers:") && reorder.current?.sourceFolderId && (drawerFolder || overlayFolder)
                ? renderExitTarget() : null}
        </View>;
    };
}

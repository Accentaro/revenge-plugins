export interface GuildMetadata {
    readonly icon?: string | null;
    readonly name: string;
}
export interface GuildReadState {
    readonly mentions?: number;
    readonly unread?: boolean;
}
export interface BadgeState {
    readonly mentionCount: number;
    readonly mentionLabel: string | undefined;
    readonly unread: boolean;
}
export interface DrawerGuild extends BadgeState {
    readonly folderId?: string;
    readonly icon?: string;
    readonly id: string;
    readonly kind: "guild";
    readonly name: string;
}
export interface DrawerFolder extends BadgeState {
    readonly children: readonly DrawerGuild[];
    readonly color: number | undefined;
    readonly id: string;
    readonly kind: "folder";
    readonly name: string | undefined;
}
export type DrawerNode = DrawerGuild | DrawerFolder;
export interface GuildTreeSources {
    readonly readState?: (guildId: string) => GuildReadState | undefined;
    readonly resolveGuild: (guildId: string) => GuildMetadata | undefined;
}
export interface GuildDockSpecs {
    readonly dockHeight: number;
    readonly dockWidth: number;
    readonly itemCount: number;
    readonly itemCountNoExtras: number;
    readonly itemSize: number;
}
export type CompactDockItem =
    | { readonly key: string; readonly kind: "dm" }
    | { readonly key: string; readonly kind: "create" }
    | { readonly key: string; readonly kind: "divider" }
    | { readonly guild: DrawerGuild; readonly key: string; readonly kind: "guild" }
    | { readonly folder: DrawerFolder; readonly key: string; readonly kind: "folder" }
    | { readonly key: string; readonly kind: "overflow" }
    | { readonly key: string; readonly kind: "spacer"; readonly visible: boolean }
    | { readonly count: number; readonly key: string; readonly kind: "unavailable" };
const EMPTY_NODES: readonly DrawerNode[] = Object.freeze([]);
const MAX_ID_LENGTH = 128;
const MAX_MENTION_COUNT = Number.MAX_SAFE_INTEGER;
const DOCK_MAX_WIDTH = 454;
const DOCK_MARGIN = 8;
const DOCK_MIN_SIZE = 80;
const DOCK_PADDING = 40;
const DOCK_ITEM_GAP = 10;
const DOCK_ITEM_SIZE = 48;
const DOCK_MIN_ITEMS = 5;
const DOCK_MAX_ITEMS = 7;
/** Discord 213's GuildDock sizing rule, recovered from GuildDockConstants/useGuildDockSpecs. */
export function computeGuildDockSpecs(availableWidth: number): GuildDockSpecs {
    const safeWidth = Number.isFinite(availableWidth) ? Math.max(0, availableWidth) : 0;
    const dockWidth = Math.max(DOCK_MIN_SIZE, Math.min(DOCK_MAX_WIDTH, safeWidth - DOCK_MARGIN * 2));
    let itemCount = DOCK_MIN_ITEMS;
    let bestScaleDistance = Number.POSITIVE_INFINITY;
    let chosenScale = 1;
    for (let count = DOCK_MIN_ITEMS; count <= DOCK_MAX_ITEMS; count++) {
        const scale = (dockWidth - DOCK_ITEM_GAP * (count - 1) - DOCK_PADDING) / (DOCK_ITEM_SIZE * count);
        const distance = Math.abs(1 - scale);
        if (distance >= bestScaleDistance) continue;
        bestScaleDistance = distance;
        chosenScale = scale;
        itemCount = count;
    }
    const itemSize = Math.max(1, Math.round(DOCK_ITEM_SIZE * chosenScale));
    return Object.freeze({
        dockHeight: Math.round(itemSize + 32),
        dockWidth,
        itemCount,
        itemCountNoExtras: itemCount - 2,
        itemSize,
    });
}
function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value as Readonly<Record<string, unknown>>
        : undefined;
}
function normalizedId(value: unknown): string | undefined {
    if (typeof value === "number") {
        return Number.isSafeInteger(value) && value >= 0 ? String(value) : undefined;
    }
    if (typeof value !== "string") return undefined;
    const id = value.trim();
    return id.length > 0 && id.length <= MAX_ID_LENGTH ? id : undefined;
}
function claimId(value: unknown, seen: Set<string>): string | undefined {
    const id = normalizedId(value);
    if (!id || seen.has(id)) return undefined;
    seen.add(id);
    return id;
}
function folderName(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const name = value.trim();
    return name.length > 0 ? name : undefined;
}
function folderColor(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffff
        ? value
        : undefined;
}
function mentionCount(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
    return Math.min(Math.floor(value), MAX_MENTION_COUNT);
}
function addMentions(left: number, right: number): number {
    return left >= MAX_MENTION_COUNT - right ? MAX_MENTION_COUNT : left + right;
}
export function displayMentionCount(value: number): string | undefined {
    const count = mentionCount(value);
    return count === 0 ? undefined : count > 99 ? "99+" : String(count);
}
function guildBadge(sources: GuildTreeSources, id: string): BadgeState {
    let state: GuildReadState | undefined;
    try {
        state = sources.readState?.(id);
    } catch {
        state = undefined;
    }
    const mentions = mentionCount(state?.mentions);
    return {
        mentionCount: mentions,
        mentionLabel: displayMentionCount(mentions),
        unread: state?.unread === true || mentions > 0,
    };
}
function parseGuild(
    value: unknown,
    sources: GuildTreeSources,
    seen: Set<string>,
    folderId?: string,
): DrawerGuild | undefined {
    const candidate = record(value);
    if (!candidate || (candidate.type !== undefined && candidate.type !== "guild")) return undefined;
    const id = claimId(candidate.id, seen);
    if (!id) return undefined;
    let metadata: GuildMetadata | undefined;
    try {
        metadata = sources.resolveGuild(id);
    } catch {
        return undefined;
    }
    if (!metadata || typeof metadata.name !== "string" || metadata.name.trim().length === 0) return undefined;
    const icon = typeof metadata.icon === "string" && metadata.icon.trim().length > 0
        ? metadata.icon.trim()
        : undefined;
    const badge = guildBadge(sources, id);
    const guild: DrawerGuild = {
        id,
        kind: "guild",
        name: metadata.name,
        mentionCount: badge.mentionCount,
        mentionLabel: badge.mentionLabel,
        unread: badge.unread,
        ...(folderId === undefined ? {} : { folderId }),
        ...(icon === undefined ? {} : { icon }),
    };
    return Object.freeze(guild);
}
function parseFolder(
    candidate: Readonly<Record<string, unknown>>,
    sources: GuildTreeSources,
    seen: Set<string>,
): DrawerFolder | undefined {
    if (!Array.isArray(candidate.children)) return undefined;
    const id = claimId(candidate.id, seen);
    if (!id) return undefined;
    const children: DrawerGuild[] = [];
    let mentions = 0;
    let unread = false;
    for (const value of candidate.children) {
        const guild = parseGuild(value, sources, seen, id);
        if (!guild) continue;
        children.push(guild);
        mentions = addMentions(mentions, guild.mentionCount);
        unread ||= guild.unread;
    }
    const folder: DrawerFolder = {
        children: Object.freeze(children),
        color: folderColor(candidate.color),
        id,
        kind: "folder",
        mentionCount: mentions,
        mentionLabel: displayMentionCount(mentions),
        name: folderName(candidate.name),
        unread,
    };
    return Object.freeze(folder);
}
export function parseGuildTree(tree: unknown, sources: GuildTreeSources): readonly DrawerNode[] {
    const root = record(record(tree)?.root);
    if (!root || !Array.isArray(root.children)) return EMPTY_NODES;
    const nodes: DrawerNode[] = [];
    const seen = new Set<string>();
    for (const value of root.children) {
        const candidate = record(value);
        if (!candidate) continue;
        const node = candidate.type === "folder"
            ? parseFolder(candidate, sources, seen)
            : parseGuild(candidate, sources, seen);
        if (node) nodes.push(node);
    }
    return Object.freeze(nodes);
}
export function guildsInTreeOrder(nodes: readonly DrawerNode[]): readonly DrawerGuild[] {
    const guilds: DrawerGuild[] = [];
    const seen = new Set<string>();
    const append = (guild: DrawerGuild): void => {
        if (seen.has(guild.id)) return;
        seen.add(guild.id);
        guilds.push(guild);
    };
    for (const node of nodes) {
        if (node.kind === "guild") append(node);
        else for (const child of node.children) append(child);
    }
    return Object.freeze(guilds);
}
function descriptorDockItem(node: DrawerNode, key: string): CompactDockItem | undefined {
    if (node.kind === "folder") {
        return node.children.length > 0
            ? Object.freeze({ folder: node, key, kind: "folder" as const })
            : undefined;
    }
    return Object.freeze({ guild: node, key, kind: "guild" as const });
}
/** Reserve the separated slot for the native Direct Messages button. */
export function buildCompactDockItems(
    nodes: readonly DrawerNode[],
    specs: Pick<GuildDockSpecs, "itemCount" | "itemCountNoExtras">,
): readonly CompactDockItem[] {
    const count = Math.max(0, Math.floor(specs.itemCountNoExtras));
    const items: CompactDockItem[] = [];
    for (let index = 0; index < count; index++) {
        const node = nodes[index];
        items.push((node ? descriptorDockItem(node, node.id) : undefined)
            ?? { key: `spacer-${index}`, kind: "spacer", visible: false });
    }
    items.push({ key: "divider", kind: "divider" }, { key: "dm", kind: "dm" }, { key: "overflow", kind: "overflow" });
    return Object.freeze(items);
}

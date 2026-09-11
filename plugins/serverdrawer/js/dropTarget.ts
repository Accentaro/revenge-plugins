export interface DropBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}
export function hitsDropTarget(point: { x: number; y: number }, bounds: DropBounds | undefined): boolean {
    if (!bounds || ![point.x, point.y, bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
        || bounds.width <= 0 || bounds.height <= 0) return false;
    return point.x >= bounds.x - 8 && point.x <= bounds.x + bounds.width + 8
        && point.y >= bounds.y - 8 && point.y <= bounds.y + bounds.height + 8;
}

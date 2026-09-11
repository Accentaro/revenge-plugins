interface MenuViewport { width: number; height: number }
export function positionGuildMenu(x: number, y: number, viewport: MenuViewport, minimumWidth: number, edge: number) {
    const anchorSize = 52;
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
    const centerX = Number.isFinite(x) ? x : viewport.width / 2;
    const centerY = Number.isFinite(y) ? y : viewport.height / 2;
    const below = centerY < viewport.height / 2;
    // Native right/above offsets are distances from the corresponding screen edge.
    // Reserve the native minimum width and open toward the larger vertical space.
    return {
        x: clamp(centerX - anchorSize / 2, edge, Math.max(edge, viewport.width - edge - minimumWidth)),
        y: below ? clamp(centerY - anchorSize / 2, edge, viewport.height / 2)
            : clamp(viewport.height - centerY - anchorSize / 2, edge, viewport.height / 2),
        positionX: "left" as const,
        positionY: below ? "below" as const : "above" as const,
        width: anchorSize,
        height: anchorSize,
    };
}

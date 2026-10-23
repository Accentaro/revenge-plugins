export interface RowBounds {
	key: string
	y: number
	height: number
}
export function getDragLayout(rows: RowBounds[], from: number, dy: number) {
	const offsets: Record<string, number> = {}
	const origin = rows[from]
	if (
		!origin ||
		rows.some(row => !Number.isFinite(row.y) || !Number.isFinite(row.height))
	)
		return { to: from, offsets }
	const center = origin.y + origin.height / 2 + dy
	let to = from
	let distance = Math.abs(dy)
	for (const [index, row] of rows.entries()) {
		const next = Math.abs(center - row.y - row.height / 2)
		if (next < distance) {
			distance = next
			to = index
		}
	}
	const ordered = [...rows]
	ordered.splice(from, 1)
	ordered.splice(to, 0, origin)
	for (const [index, row] of ordered.entries())
		offsets[row.key] = rows[index].y - row.y
	return { to, offsets }
}

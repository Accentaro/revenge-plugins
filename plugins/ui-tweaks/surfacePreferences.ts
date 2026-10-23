export interface SurfacePreferences {
	hidden: string[]
	order: string[]
}

export const defaultSurfacePreferences: SurfacePreferences = {
	hidden: [],
	order: [],
}

// Unranked and unsupported entries keep their original slots.
export function applyOrder<T>(
	items: readonly T[],
	order: readonly string[],
	identify: (item: T) => string | undefined,
): T[] {
	const ranks = new Map(order.map((id, index) => [id, index]))
	const ranked = items
		.filter(item => ranks.has(identify(item) ?? ''))
		.sort((a, b) => ranks.get(identify(a)!)! - ranks.get(identify(b)!)!)
	let index = 0
	return items.map(item =>
		ranks.has(identify(item) ?? '') ? ranked[index++] : item,
	)
}

export function movePreference(
	preferences: SurfacePreferences,
	visible: readonly string[],
	from: number,
	to: number,
): SurfacePreferences {
	if (from === to || !visible[from] || !visible[to]) return preferences
	const changed = visible.slice(Math.min(from, to), Math.max(from, to) + 1)
	if (from < to) changed.push(changed.shift()!)
	else changed.unshift(changed.pop()!)
	// Retain unavailable actions and preferences belonging to other groups.
	const order = [...new Set([...preferences.order, ...changed])]
	const desired = [...visible]
	desired.splice(to, 0, desired.splice(from, 1)[0])
	const ranked = desired.filter(id => order.includes(id))
	let index = 0
	return {
		...preferences,
		order: order.map(id => (ranked.includes(id) ? ranked[index++] : id)),
	}
}

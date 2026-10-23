import { applyOrder } from './surfacePreferences'
import type { SurfacePreferences } from './surfacePreferences'

export interface SettingsLayoutRow {
	type: 'section_row'
	setting: string
	start: boolean
	end: boolean
}

export interface SettingsLayoutHeader {
	type: 'section_header'
	label?: unknown
}

export interface SettingsLayoutGroup<
	R extends SettingsLayoutRow,
	H extends SettingsLayoutHeader,
> {
	key: string
	header?: H
	rows: R[]
}

export function groupSettingsRows<
	R extends SettingsLayoutRow,
	H extends SettingsLayoutHeader,
>(data: readonly (R | H)[]): SettingsLayoutGroup<R, H>[] | undefined {
	const groups: SettingsLayoutGroup<R, H>[] = []
	let header: H | undefined
	let group: SettingsLayoutGroup<R, H> | undefined
	const ids = new Set<string>()
	for (const item of data) {
		if (item.type === 'section_header') {
			header = item
			group = undefined
		} else if (
			item.type === 'section_row' &&
			typeof item.setting === 'string'
		) {
			if (ids.has(item.setting)) return
			ids.add(item.setting)
			if (!group || item.start) {
				group = { key: item.setting, header, rows: [] }
				groups.push(group)
				header = undefined
			}
			group.rows.push(item)
		} else return
	}
	return groups
}

export function applySettingsLayout<
	R extends SettingsLayoutRow,
	H extends SettingsLayoutHeader,
>(
	groups: readonly SettingsLayoutGroup<R, H>[],
	preferences: SurfacePreferences,
): (R | H)[] {
	return groups.flatMap(group => {
		const rows = applyOrder(
			group.rows.filter(row => !preferences.hidden.includes(row.setting)),
			preferences.order,
			row => row.setting,
		)
		if (!rows.length) return []
		return [
			...(group.header ? [group.header] : []),
			...rows.map((row, index) => ({
				...row,
				start: index === 0,
				end: index === rows.length - 1,
			})),
		]
	})
}

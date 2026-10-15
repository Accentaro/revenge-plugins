export const profileOptions = [
	['hideAvatarDecorations', 'Hide avatar decorations'],
	['hideNameplates', 'Hide nameplates'],
	['hideProfileEffects', 'Hide profile effects'],
	['hideProfileFrames', 'Hide profile frames'],
	['hideGuildTags', 'Hide guild tags'],
	['hideDisplayNameStyles', 'Hide display-name styles'],
] as const

export const paymentOptions = [
	['hidePaymentShop', 'Shop', 'COLLECTIBLES_SHOP'],
	['hidePaymentQuests', 'Quests', 'QUEST_HOME'],
	['hidePaymentNitro', 'Nitro Home', 'PREMIUM'],
	[
		'hidePaymentSubscriptions',
		'Manage Subscriptions',
		'PREMIUM_MANAGE_SUBSCRIPTIONS',
	],
	['hidePaymentBoosts', 'Server Boost', 'PREMIUM_GUILD_BOOSTING'],
	['hidePaymentGifts', 'Gift Inventory', 'PREMIUM_GIFTING'],
] as const

export const userAreaOptions = [
	['removeUserQuests', 'Quests', 'quests'],
	['removeUserShop', 'Shop', 'shop'],
	['removeUserNitro', 'Nitro', 'nitro'],
] as const

export interface PaymentRow {
	setting?: string
	type?: string
}
export type ExtraClutterSettings = Record<
	| (typeof profileOptions)[number][0]
	| (typeof paymentOptions)[number][0]
	| (typeof userAreaOptions)[number][0]
	| 'hidePaymentSettings',
	boolean
>

export function filterPaymentRows<Row extends PaymentRow>(
	rows: Row[],
	settings: ExtraClutterSettings,
): Row[] {
	const hidden = new Set<string>(
		paymentOptions
			.filter(([key]) => settings.hidePaymentSettings || settings[key])
			.map(([, , id]) => id),
	)
	if (!rows.some(row => row.setting !== undefined && hidden.has(row.setting)))
		return rows
	// Headers and footers belong to the rows up to the next section header.
	// Drop a section only when this filter removed all its rows.
	const output: Row[] = []
	for (let start = 0; start < rows.length; ) {
		let end = start + 1
		while (end < rows.length && rows[end].type !== 'section_header') end++
		const section = rows.slice(start, end)
		const kept = section.filter(
			row => !(row.setting !== undefined && hidden.has(row.setting)),
		)
		const removed = kept.length !== section.length
		if (!removed || kept.some(row => row.setting != null)) output.push(...kept)
		start = end
	}
	return output
}

export type Settings = ExtraClutterSettings & {
	hideServerBoostGoal: boolean
	disableServerThemes: boolean
	hideDmActivityCards: boolean
	hideProfileBadges: boolean
	hideProfileTabs: boolean
	hideOrbsBalance: boolean
	hideQuestDock: boolean
}
export const DefaultSettings: Settings = {
	hideAvatarDecorations: true,
	hideNameplates: true,
	hideProfileEffects: true,
	hideProfileFrames: true,
	hideGuildTags: true,
	hideDisplayNameStyles: true,
	hidePaymentSettings: true,
	hidePaymentShop: false,
	hidePaymentQuests: false,
	hidePaymentNitro: false,
	hidePaymentSubscriptions: false,
	hidePaymentBoosts: false,
	hidePaymentGifts: false,
	hideServerBoostGoal: true,
	disableServerThemes: false,
	hideDmActivityCards: true,
	hideProfileBadges: false,
	hideProfileTabs: false,
	hideOrbsBalance: false,
	hideQuestDock: false,
	removeUserQuests: false,
	removeUserShop: false,
	removeUserNitro: false,
}

export function filterProfileTabs<T extends { id: string }>(items: T[]): T[] {
	const filtered = items.filter(
		item => !['wishlist', 'board', 'activity'].includes(item.id),
	)
	return filtered.length && filtered.length !== items.length ? filtered : items
}

export function resolveSettings(saved?: Partial<Settings> | null): Settings {
	return {
		...DefaultSettings,
		...saved,
		hideQuestDock:
			saved?.hideQuestDock ??
			saved?.removeUserQuests ??
			DefaultSettings.hideQuestDock,
	}
}

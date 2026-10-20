import { onImportedPath, safeInstead } from '../modules'
import { getSettings } from '../state'

/*
 *   14840 modules/settings/native/renderer/SettingTreeManager.tsx
 *   13809 modules/user_settings/core/native/SettingsRendererConfig.tsx
 */

export const PAYMENT_OPTIONS = [
	['paymentShop', 'Shop', 'COLLECTIBLES_SHOP'],
	['paymentQuests', 'Quests', 'QUEST_HOME'],
	['paymentNitro', 'Nitro Home', 'PREMIUM'],
	[
		'paymentSubscriptions',
		'Manage Subscriptions',
		'PREMIUM_MANAGE_SUBSCRIPTIONS',
	],
	['paymentBoosts', 'Server Boost', 'PREMIUM_GUILD_BOOSTING'],
	['paymentGifts', 'Gift Inventory', 'PREMIUM_GIFTING'],
] as const

const PREMIUM_SETTINGS = new Set([
	'PREMIUM',
	'PREMIUM_MANAGE_SUBSCRIPTIONS',
	'PREMIUM_MANAGE_PLAN',
	'PREMIUM_PLAN_SELECT',
	'PREMIUM_GIFTING',
	'PREMIUM_GUILD_BOOSTING',
	'PREMIUM_RESTORE_SUBSCRIPTION',
	'GUILD_ROLE_SUBSCRIPTIONS',
	'GUILD_ROLE_SUBSCRIPTIONS_CANCEL',
	'PREMIUM_PROFILE_CUSTOMIZATION_TRY_IT_OUT',
	'COLLECTIBLES_SHOP',
	'COLLECTIBLES_SHOP_VIEW_ALL_CATEGORY_ITEMS',
	'QUEST_HOME',
	'QUEST_PREVIEW_TOOL',
])

export function patchSettingsPage(): () => void {
	const unpatch: Array<() => void> = []

	unpatch.push(
		onImportedPath<any>(
			'modules/settings/native/renderer/SettingTreeManager.tsx',
			ns => {
				const manager = ns?.default
				if (!manager || typeof manager.isBlocked !== 'function') return
				unpatch.push(
					safeInstead(manager, 'isBlocked', (args, original) => {
						const field = args?.[0]
						const settings = getSettings()
						if (
							(settings.premiumSettings &&
								typeof field === 'string' &&
								PREMIUM_SETTINGS.has(field)) ||
							PAYMENT_OPTIONS.some(
								([key, , id]) => settings[key] && field === id,
							)
						) {
							return true
						}
						return original.apply(manager, args)
					}),
				)
			},
		),
	)

	return () => {
		for (const un of unpatch) un?.()
	}
}

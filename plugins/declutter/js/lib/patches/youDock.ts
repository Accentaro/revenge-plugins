import { onComponentPatch } from '../modules'
import { getSettings } from '../state'

/*
 *   14336 modules/quests/native/QuestDock/QuestDock.tsx
 *   15759 modules/main_tabs_v2/native/tabs/you/YouBannerDecorations.tsx
 *   14930 modules/virtual_currency/native/BalanceWidgetMenu.tsx
 *   15763 modules/main_tabs_v2/native/tabs/you/YouScreenNavIcon.tsx
 *   15764 modules/collectibles/native/CollectiblesShopEntryButton.tsx
 *   15766 modules/main_tabs_v2/native/tabs/you/YouScreenNavIconNitroSubscriber.tsx
 */

export function patchYouDock(): () => void {
	const unpatch: Array<() => void> = []

	// The Quest Dock is Server Drawer's own UI surface, so the two cannot both
	// own it. The conflict is resolved on read in getSettings(): hiding applies
	// whenever Server Drawer is not installed, and stops applying without
	// touching stored settings while it is. The hook therefore stays installed
	// for the whole session and only reads the setting per render, which is why
	// toggling the option needs no re-patch.
	unpatch.push(
		onComponentPatch(
			'modules/quests/native/QuestDock/QuestDock.tsx',
			(args, jsx) => {
				if (!getSettings().questDock) return jsx(...args)
				return null
			},
		),
	)

	unpatch.push(
		onComponentPatch(
			'modules/main_tabs_v2/native/tabs/you/YouScreenNavIcon.tsx',
			(args, jsx) => {
				const settings = getSettings()
				const key = args?.[2]
				if (key === 'quests' && settings.youTabQuestsButton) {
					return null
				}
				if (key === 'nitro' && settings.youTabNitroButton) {
					return null
				}
				return jsx(...args)
			},
		),
	)

	unpatch.push(
		onComponentPatch(
			'modules/collectibles/native/CollectiblesShopEntryButton.tsx',
			(args, jsx) => {
				if (getSettings().youTabShopButton && args?.[2] === 'shop') {
					return null
				}
				return jsx(...args)
			},
		),
	)

	unpatch.push(
		onComponentPatch(
			'modules/main_tabs_v2/native/tabs/you/YouScreenNavIconNitroSubscriber.tsx',
			(args, jsx) => {
				if (
					getSettings().youTabNitroButton &&
					args?.[2] === 'nitro-subscriber'
				) {
					return null
				}
				return jsx(...args)
			},
		),
	)

	unpatch.push(
		onComponentPatch(
			'modules/virtual_currency/native/BalanceWidgetMenu.tsx',
			(args, jsx) => {
				if (getSettings().youTabOrbsBalance) return null
				return jsx(...args)
			},
		),
	)

	return () => {
		for (const un of unpatch) un?.()
	}
}

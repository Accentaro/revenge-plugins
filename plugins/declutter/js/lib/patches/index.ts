import { patchAvatarDecorations } from './avatarDecorations'
import { patchBadges } from './badges'
import { patchBoostGoal } from './boostGoal'
import { patchChannelNameEmojis } from './channelNameEmojis'
import { patchDisplayNameStyles } from './displayNameStyles'
import { patchDmActivityCards } from './dmActivityCards'
import { patchMessageClutter } from './messageClutter'
import { patchNameplates } from './nameplates'
import { patchProfileEffects } from './profileEffects'
import { patchProfileFrames } from './profileFrames'
import { patchServerTags } from './serverTags'
import { patchServerThemes } from './serverThemes'
import { patchSettingsPage } from './settingsPage'
import { patchWishlist } from './wishlist'
import { patchYouDock } from './youDock'

export function patchAll(): () => void {
	const unpatch: Array<() => void> = []

	unpatch.push(patchAvatarDecorations())
	unpatch.push(patchMessageClutter())
	unpatch.push(patchNameplates())
	unpatch.push(patchProfileEffects())
	unpatch.push(patchProfileFrames())
	unpatch.push(patchServerTags())
	unpatch.push(patchBadges())
	unpatch.push(patchSettingsPage())
	unpatch.push(patchWishlist())
	unpatch.push(patchYouDock())
	unpatch.push(patchBoostGoal())
	unpatch.push(patchChannelNameEmojis())
	unpatch.push(patchDisplayNameStyles())
	unpatch.push(patchDmActivityCards())
	unpatch.push(patchServerThemes())

	return () => {
		for (const un of unpatch) un?.()
	}
}

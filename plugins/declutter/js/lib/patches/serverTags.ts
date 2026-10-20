import {
	onImportedPath,
	resolveComponent,
	safeInstead,
	safeInsteadJSX,
} from '../modules'
import { getSettings } from '../state'

/*
 *   8189  modules/guild_tag/GuildTagUtils.tsx
 *   9170  modules/guild_tag/native/GuildTag.tsx
 *   15164 modules/guild_tag/native/VoiceGuildTag.tsx
 */
export function patchServerTags(): () => void {
	const unpatch: Array<() => void> = []

	const enabled = () => getSettings().serverTags

	unpatch.push(
		onImportedPath<any>('modules/guild_tag/GuildTagUtils.tsx', ns => {
			unpatch.push(
				safeInstead(ns, 'useShouldDisplayGuildTag', (args, original) => {
					const shouldDisplay = original(...args)
					return enabled() ? false : shouldDisplay
				}),
				safeInstead(ns, 'shouldDisplayGuildTag', (args, original) => {
					if (!enabled()) return original(...args)
					return false
				}),
				safeInstead(ns, 'getUserPrimaryGuild', (args, original) => {
					const result = original(...args)
					if (!enabled() || !result) return result
					return { ...result, tag: null, badge: null, guildId: null }
				}),
			)
		}),
	)

	unpatch.push(
		onImportedPath<any>('modules/guild_tag/native/GuildTag.tsx', ns => {
			const components = [
				resolveComponent(ns),
				resolveComponent(ns.GuildTagBadge),
				resolveComponent(ns.BaseGuildTagChiplet),
			]
			for (const component of components) {
				if (!component) continue
				unpatch.push(
					safeInsteadJSX(component, (args, jsx) => {
						if (!enabled()) return jsx(...args)
						return null
					}),
				)
			}
		}),
	)

	unpatch.push(
		onImportedPath<any>('modules/guild_tag/native/VoiceGuildTag.tsx', ns => {
			const chiplet = resolveComponent(ns)
			if (!chiplet) return
			unpatch.push(
				safeInsteadJSX(chiplet, (args, jsx) => {
					if (!enabled()) return jsx(...args)
					return null
				}),
			)
		}),
	)

	return () => {
		for (const un of unpatch) un?.()
	}
}

import { onImportedPath, safeInstead } from '../modules'
import { getSettings } from '../state'

export function patchBoostGoal(): () => void {
	const unpatch: Array<() => void> = []

	const enabled = () => getSettings().boostGoal

	// Patch useGuildActionRows to filter out GUILD_PREMIUM_PROGRESS_BAR
	unpatch.push(
		onImportedPath<any>('modules/guild_sidebar/useGuildActionRows.tsx', ns => {
			const hook = ns?.default
			if (typeof hook !== 'function') return
			unpatch.push(
				safeInstead(ns, 'default', (args, original) => {
					const result = original(...args)
					if (!enabled() || !Array.isArray(result)) return result
					return result.filter(
						(row: any) => row !== 'guild-premium-progress-bar',
					)
				}),
			)
		}),
	)

	return () => {
		for (const un of unpatch) un?.()
	}
}

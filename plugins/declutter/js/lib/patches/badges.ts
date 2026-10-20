import { getDefaultNameFilter, onModule, safeInstead } from '../modules'
import { getSettings } from '../state'

export function patchBadges(): () => void {
	const unpatch: Array<() => void> = []

	const enabled = () => getSettings().badges

	unpatch.push(
		onModule(getDefaultNameFilter('useBadges'), ns => {
			unpatch.push(
				safeInstead(ns, 'default', (args, original) => {
					const badges = original(...args)
					return enabled() ? [] : badges
				}),
			)
		}),
	)

	return () => {
		for (const un of unpatch) un?.()
	}
}

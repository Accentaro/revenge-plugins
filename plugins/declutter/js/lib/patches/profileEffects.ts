import {
	getDefaultNameFilter,
	onModule,
	resolveComponent,
	safeInstead,
	safeInsteadJSX,
} from '../modules'
import { getSettings } from '../state'

export function patchProfileEffects(): () => void {
	const unpatch: Array<() => void> = []

	const enabled = () => getSettings().profileEffects

	unpatch.push(
		onModule(getDefaultNameFilter('useProfileEffect'), ns => {
			unpatch.push(
				safeInstead(ns, 'default', (args, original) => {
					const effect = original(...args)
					return enabled() ? null : effect
				}),
			)
		}),
	)

	unpatch.push(
		onModule(getDefaultNameFilter('WrappedProfileEffect'), ns => {
			const component = resolveComponent(ns)
			if (!component) return
			unpatch.push(
				safeInsteadJSX(component, (args, jsx) => {
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

import {
	getDefaultNameFilter,
	getPropsFilter,
	onModule,
	resolveComponent,
	safeInstead,
	safeInsteadJSX,
} from '../modules'
import { getSettings } from '../state'

export function patchNameplates(): () => void {
	const unpatch: Array<() => void> = []

	const enabled = () => getSettings().nameplates

	unpatch.push(
		onModule(getPropsFilter('useNameplate'), ns => {
			unpatch.push(
				safeInstead(ns, 'useNameplate', (args, original) => {
					const nameplate = original(...args)
					return enabled() ? null : nameplate
				}),
			)
		}),
	)

	unpatch.push(
		onModule(getDefaultNameFilter('Nameplate'), ns => {
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

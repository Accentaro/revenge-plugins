import {
	getDefaultNameFilter,
	getProfileFrameComponentFilter,
	onModule,
	resolveComponent,
	safeInstead,
	safeInsteadJSX,
} from '../modules'
import { getSettings } from '../state'

export function patchProfileFrames(): () => void {
	const unpatch: Array<() => void> = []

	const enabled = () => getSettings().profileFrames

	unpatch.push(
		onModule(getDefaultNameFilter('useProfileFrame'), ns => {
			unpatch.push(
				safeInstead(ns, 'default', (args, original) => {
					const frame = original(...args)
					return enabled() ? null : frame
				}),
			)
		}),
	)

	unpatch.push(
		onModule(getProfileFrameComponentFilter(), ns => {
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

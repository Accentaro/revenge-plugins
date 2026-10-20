import { onImportedPath, safeInstead, safeInsteadJSX } from '../modules'
import { getSettings } from '../state'

export function patchWishlist(): () => void {
	const unpatch: Array<() => void> = []

	const enabled = () => getSettings().wishlist

	// Patch useSegmentedControlState to filter out wishlist/board items
	unpatch.push(
		onImportedPath<any>(
			'design/components/SegmentedControl/native/SegmentedControlState.native.tsx',
			ns => {
				if (typeof ns?.useSegmentedControlState !== 'function') return
				unpatch.push(
					safeInstead(ns, 'useSegmentedControlState', (args, original) => {
						if (!enabled()) return original(...args)
						if (!Array.isArray(args[0]?.items)) return original(...args)
						const items = args[0].items
						if (
							!items.some(
								(i: any) =>
									i?.id === 'wishlist' ||
									i?.id === 'board' ||
									i?.id === 'activity',
							)
						) {
							return original(...args)
						}
						const filtered = items.filter(
							(i: any) =>
								i?.id !== 'wishlist' &&
								i?.id !== 'board' &&
								i?.id !== 'activity',
						)
						return original({ ...args[0], items: filtered })
					}),
				)
			},
		),
	)

	// Patch Tabs to hide bar when only 1 tab remains
	unpatch.push(
		onImportedPath<any>('design/components/Tabs/native/Tabs.native.tsx', ns => {
			const Tabs = ns?.Tabs
			if (typeof Tabs !== 'function') return
			unpatch.push(
				safeInsteadJSX(Tabs, (args: any, jsx: any) => {
					if (!enabled()) return jsx(...args)
					const state = args?.[1]?.state
					const items = state?.items
					if (Array.isArray(items) && items.length <= 1) return null
					return jsx(...args)
				}),
			)
		}),
	)

	return () => {
		for (const un of unpatch) un?.()
	}
}

import { onImportedPath, safeInstead } from '../modules'
import { getSettings } from '../state'
import type { ReactNode } from 'react'

interface ActivityCardsModule {
	default: { type: (...args: unknown[]) => ReactNode }
	getMessagesItemHappeningNowHeight: (...args: unknown[]) => number
}

export function patchDmActivityCards(): () => void {
	const unpatch: Array<() => void> = []

	unpatch.push(
		onImportedPath(
			'modules/main_tabs_v2/native/tabs/messages/items/MessagesItemHappeningNow.tsx',
			(ns: ActivityCardsModule) => {
				unpatch.push(
					safeInstead(
						ns.default,
						'type',
						function (this: unknown, args, original) {
							const result = Reflect.apply(original, this, args)
							return getSettings().dmActivityCards ? null : result
						},
					),
					safeInstead(
						ns,
						'getMessagesItemHappeningNowHeight',
						function (this: unknown, args, original) {
							const height = Reflect.apply(original, this, args)
							return getSettings().dmActivityCards ? 0 : height
						},
					),
				)
			},
		),
	)

	return () => {
		for (const un of unpatch) un?.()
	}
}

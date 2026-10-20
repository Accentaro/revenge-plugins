import { getDefaultNameFilter, onModule, safeInstead } from '../modules'
import { getSettings } from '../state'

export function patchDisplayNameStyles(): () => void {
	const unpatch: Array<() => void> = []
	let disposed = false

	for (const name of ['useDisplayNameStyles', 'createMessageContent'])
		unpatch.push(
			onModule(
				getDefaultNameFilter(name),
				(ns: { default: (...args: unknown[]) => unknown }) => {
					if (disposed) return
					unpatch.push(
						safeInstead(
							ns,
							'default',
							function (this: unknown, args, original) {
								const result = Reflect.apply(original, this, args)
								if (!getSettings().displayNameStyles) return result
								if (name === 'useDisplayNameStyles') return null
								return result &&
									typeof result === 'object' &&
									'displayNameStyles' in result &&
									result.displayNameStyles != null
									? { ...result, displayNameStyles: null }
									: result
							},
						),
					)
				},
			),
		)

	return () => {
		disposed = true
		for (const un of unpatch) un?.()
	}
}

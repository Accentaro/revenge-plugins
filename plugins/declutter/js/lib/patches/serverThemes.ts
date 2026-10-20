import { onImportedPath, safeInstead } from '../modules'
import { getSettings } from '../state'

export function patchServerThemes(): () => void {
	const unpatch: Array<() => void> = []

	unpatch.push(
		onImportedPath(
			'modules/premium/powerups/experiments/ServerThemeUserExperiment.tsx',
			(
				ns: Record<
					'getServerThemeUserEnabled' | 'useServerThemeUserEnabled',
					(...args: unknown[]) => boolean
				>,
			) => {
				for (const key of [
					'getServerThemeUserEnabled',
					'useServerThemeUserEnabled',
				] as const)
					unpatch.push(
						safeInstead(ns, key, function (this: unknown, args, original) {
							const enabled = Reflect.apply(original, this, args)
							return getSettings().serverThemes ? false : enabled
						}),
					)
			},
		),
	)

	return () => {
		for (const un of unpatch) un?.()
	}
}

import { getModuleWithImportedPath } from '@revenge-mod/discord/utils/modules/finders'
import { getModules } from '@revenge-mod/modules/finders'
import {
	withName,
	withoutProps,
	withProps,
} from '@revenge-mod/modules/finders/filters'
import { instead } from '@revenge-mod/patcher'
import { afterJSX, insteadJSX } from '@revenge-mod/react/jsx-runtime'
import type { Filter } from '@revenge-mod/modules/finders/filters'
import type { ElementType } from 'react'

let reportError: (error: unknown) => void

export function initModules(report: (error: unknown) => void) {
	reportError = report
}

export const getDefaultNameFilter = withName
export const getPropsFilter = withProps
export const safeInstead = instead
export const safeInsteadJSX = insteadJSX
export const safeAfterJSX = afterJSX

export function getProfileFrameComponentFilter() {
	return withName('ProfileFrame').and(withoutProps('fromServer'))
}

function isComponent(value: unknown): value is ElementType {
	if (typeof value === 'function') return true
	if (!value || typeof value !== 'object' || !('$$typeof' in value))
		return false
	return (
		value.$$typeof === Symbol.for('react.memo') ||
		value.$$typeof === Symbol.for('react.forward_ref') ||
		value.$$typeof === Symbol.for('react.provider')
	)
}

export function resolveComponent(exports: unknown): ElementType | undefined {
	if (isComponent(exports)) return exports
	if (!exports || typeof exports !== 'object') return undefined
	if ('default' in exports && isComponent(exports.default))
		return exports.default
	if ('type' in exports && isComponent(exports.type)) return exports.type
	return undefined
}

export function onModule<T = any>(
	filter: Filter,
	cb: (namespace: T, id: number) => void,
): () => void {
	let disposed = false
	const unsubscribe = getModules(
		filter,
		(namespace: T, id) => {
			if (disposed) return
			try {
				cb(namespace, id)
			} catch (error) {
				reportError(error)
			}
		},
		{ returnNamespace: true },
	)
	return () => {
		disposed = true
		unsubscribe()
	}
}

export function onImportedPath<T = any>(
	path: string,
	cb: (namespace: T, id: number) => void,
): () => void {
	let disposed = false
	const unsubscribe = getModuleWithImportedPath<T>(path, (namespace, id) => {
		if (disposed) return
		try {
			cb(namespace, id)
		} catch (error) {
			reportError(error)
		}
	})
	return () => {
		disposed = true
		unsubscribe()
	}
}

/**
 * Patches a component exported by `path`, resolving the component from the
 * module namespace.
 *
 * `onImportedPath` reports a namespace once, and the component is resolved
 * from that snapshot. Resolving can legitimately miss, so this re-attempts on
 * a short interval instead of leaving the option silently inert, and it stops
 * once the component has been found. `seen` keeps a namespace that is still in
 * the registry from being wrapped a second time on every start/stop cycle,
 * which would stack insteadJSX wrappers until the nesting is deep enough for
 * the patch to stop applying. The attempt loop is also what makes a later miss
 * harmless: nothing is scheduled after `dispose`, so a namespace arriving
 * during teardown can no longer install a patch that nothing will ever remove.
 */
export function onComponentPatch(
	path: string,
	hook: (args: any[], jsx: any) => any,
): () => void {
	const cleanups: Array<() => void> = []
	const seen = new Set<any>()
	let disposed = false
	let timer: ReturnType<typeof setTimeout> | undefined

	function tryPatch(exports: any) {
		if (disposed) return
		const component = resolveComponent(exports)
		if (!component || seen.has(component)) return
		seen.add(component)
		if (disposed) return
		cleanups.push(safeInsteadJSX(component, hook))
	}

	function schedule(exports: any, attempt: number) {
		if (disposed || attempt >= 10) return
		timer = setTimeout(() => {
			timer = undefined
			if (disposed) return
			tryPatch(exports)
			schedule(exports, attempt + 1)
		}, 500)
	}

	function handle(exports: any) {
		if (disposed) return
		tryPatch(exports)
		schedule(exports, 0)
	}

	const unsub = onImportedPath<any>(path, handle)

	return () => {
		disposed = true
		if (timer !== undefined) clearTimeout(timer)
		unsub?.()
		// Iterate a snapshot: `handle` can append while cleanup runs.
		for (const un of cleanups.splice(0)) un?.()
	}
}

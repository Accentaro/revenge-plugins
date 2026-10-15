import { useSyncExternalStore } from 'react'
import type { JsonStorage } from '@revenge-mod/json-storage'

export const GridQualities = ['gif', 'tinygif', 'nanogif'] as const
export type GridQuality = (typeof GridQualities)[number]
export const providerLabels = {
	tenor: 'Tenor',
	giphy: 'Giphy',
	klipy: 'Klipy',
} as const
export type Provider = keyof typeof providerLabels
export const providers = Object.keys(providerLabels) as Provider[]
export interface GifProvidersSettings {
	gridQuality: GridQuality
	providers: Provider[]
}
export const defaults: GifProvidersSettings = {
	gridQuality: 'tinygif',
	providers: ['tenor'],
}
export let gifProvidersSettings = defaults
let storage: JsonStorage<GifProvidersSettings>
let active = false
const listeners = new Set<() => void>()
export function selectedProviders(value: readonly Provider[]): Provider[] {
	const selected = providers.filter(provider => value?.includes(provider))
	return selected.length ? selected : ['tenor']
}
export function configureStorage(instance: JsonStorage<GifProvidersSettings>) {
	storage = instance
}
export async function loadSettings() {
	const value = storage.cache ?? (await storage.get())
	if (!value) throw new Error('Could not load GIF Providers settings.')
	gifProvidersSettings = { ...defaults, ...value }
	publish()
}
function publish() {
	for (const listener of listeners) listener()
}
export function setActive(value: boolean) {
	active = value
	publish()
}
function subscribe(listener: () => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}
export function useProvidersEnabled() {
	return useSyncExternalStore(subscribe, () => active)
}
function updateSettings(update: Partial<GifProvidersSettings>) {
	gifProvidersSettings = { ...gifProvidersSettings, ...update }
	void storage.set(gifProvidersSettings, true)
	publish()
}
export function useGifProvidersSettings() {
	const settings = useSyncExternalStore(subscribe, () => gifProvidersSettings)
	return { ...settings, updateSettings }
}
useGifProvidersSettings.subscribe = subscribe

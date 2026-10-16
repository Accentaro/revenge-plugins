import { Stores } from '@revenge-mod/discord/flux'
import { lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { useSyncExternalStore } from 'react'
import { normalize, toRecords } from './metadata'
import { currentAccountId } from './native'
import { flushCollections, persistCollections } from './persistence'
import { queue } from './sync/replica'
import type { JsonStorage } from '@revenge-mod/json-storage'
import type { Collection, CollectionStorage, Gif } from './types'

interface State extends CollectionStorage {
	_active: boolean
	_hasHydrated: boolean
	updateSettings(update: Partial<CollectionStorage>): void
}
let storage: JsonStorage<CollectionStorage>
let reportError: (error: unknown) => void
let loading: Promise<void> | undefined
const listeners = new Set<(state: State, previous: State) => void>()
let state: State = {
	accounts: {},
	cloud: {},
	onlyShowCollections: false,
	_active: false,
	_hasHydrated: false,
	updateSettings,
}
function publish(next: State) {
	const previous = state
	state = next
	for (const listener of listeners) listener(state, previous)
}
function updateSettings(update: Partial<CollectionStorage>) {
	if (!state._hasHydrated) throw new Error('Collections have not loaded yet.')
	const next = { ...state, ...update }
	persistCollections(
		storage,
		{
			accounts: next.accounts,
			cloud: next.cloud,
			onlyShowCollections: next.onlyShowCollections,
		},
		reportError,
	)
	publish(next)
}
export function collectionsActive() {
	return state._active
}
export async function startStorage(
	instance: JsonStorage<CollectionStorage>,
	report: (error: unknown) => void,
	signal: AbortSignal,
) {
	configureStorage(instance, report)
	await loadStorage()
	if (signal.aborted) return
	publish({ ...state, _active: true })
	signal.addEventListener(
		'abort',
		() => publish({ ...state, _active: false }),
		{ once: true },
	)
}
export function configureStorage(
	instance: JsonStorage<CollectionStorage>,
	report: (error: unknown) => void,
) {
	storage = instance
	reportError = report
}
export async function loadStorage() {
	if (state._hasHydrated) return
	if (!loading)
		loading = (async () => {
			await flushCollections()
			const value = await storage.get()
			if (!value?.accounts || !value.cloud)
				throw new Error('Could not load collection storage.')
			publish({
				...state,
				...value,
				onlyShowCollections: value.onlyShowCollections ?? false,
				_hasHydrated: true,
				updateSettings,
			})
		})().finally(() => {
			loading = undefined
		})
	await loading
}
// Optimistic snapshots preserve consecutive edits while scoped storage serializes durable writes.
export function useCollectionStore<T>(select: (state: State) => T): T {
	return select(
		useSyncExternalStore(
			listener => useCollectionStore.subscribe(listener),
			() => state,
		),
	)
}
useCollectionStore.getState = () => state
useCollectionStore.subscribe = (
	listener: (state: State, previous: State) => void,
) => {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}
const emptyCollections: Collection[] = []

// Track picker items without persisting their collection context or retaining closed lists.
export const collectionSources = new WeakMap<
	Gif,
	{ accountId: string; collectionId: string }
>()

export function useCollectionsEnabled() {
	return useCollectionStore(state => state._active && state._hasHydrated)
}

export function useAccountId(): string | undefined {
	const [flux] = lookupModule(
		withProps<{ useStateFromStores<T>(stores: unknown[], read: () => T): T }>(
			'useStateFromStores',
		),
	)
	if (!flux) throw new Error('GIF Collections: Flux hooks unavailable')
	return flux.useStateFromStores([Stores.UserStore], () => currentAccountId())
}

export function useCollections(accountId: string) {
	return useCollectionStore(
		state => state.accounts[accountId] ?? emptyCollections,
	)
}

export function updateCollections(
	accountId: string,
	update: (collections: Collection[]) => Collection[],
	allowDisabled = false,
) {
	const state = useCollectionStore.getState()
	if (
		!state._hasHydrated ||
		(!allowDisabled && !collectionsActive()) ||
		currentAccountId() !== accountId
	)
		return

	const collections = state.accounts[accountId] ?? emptyCollections
	const next = update(collections)
	if (next !== collections) {
		const normalized = normalize(next)
		const cloud = state.cloud[accountId]
		state.updateSettings({
			accounts: { ...state.accounts, [accountId]: normalized },
			...(cloud
				? {
						cloud: {
							...state.cloud,
							[accountId]: {
								...cloud,
								replica: queue(cloud.replica, toRecords(normalized)),
							},
						},
					}
				: {}),
		})
	}
}

function moveItem<T>(items: T[], index: number, direction: number): T[] {
	const destination = index + direction
	if (index < 0 || destination < 0 || destination >= items.length) return items

	const next = [...items]
	;[next[index], next[destination]] = [next[destination], next[index]]
	return next
}

export function reorderCollection(
	accountId: string,
	id: string,
	targetId: string,
) {
	updateCollections(accountId, items => {
		const from = items.findIndex(item => item.id === id)
		const to = items.findIndex(item => item.id === targetId)
		if (from < 0 || to < 0 || from === to) return items

		const next = [...items]
		next.splice(to, 0, ...next.splice(from, 1))
		return next
	})
}

export function saveCollection(
	accountId: string,
	name: string,
	collectionId?: string,
	gif?: Gif,
) {
	const trimmed = name.trim()
	if (!trimmed || trimmed.length > 60)
		throw new Error('Use a collection name between 1 and 60 characters.')

	updateCollections(accountId, collections => {
		if (
			collections.some(
				collection =>
					collection.id !== collectionId &&
					collection.name.toLowerCase() === trimmed.toLowerCase(),
			)
		) {
			throw new Error('A collection with this name already exists.')
		}

		if (collectionId)
			return collections.map(collection =>
				collection.id === collectionId
					? { ...collection, name: trimmed }
					: collection,
			)

		return [
			...collections,
			{
				id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
				name: trimmed,
				gifs: gif ? [gif] : [],
			},
		]
	})
}

function updateGifs(
	accountId: string,
	collectionId: string,
	update: (gifs: Gif[]) => Gif[],
) {
	updateCollections(accountId, collections =>
		collections.map(collection => {
			if (collection.id !== collectionId) return collection
			const gifs = update(collection.gifs)
			return gifs === collection.gifs ? collection : { ...collection, gifs }
		}),
	)
}

export function removeGif(accountId: string, collectionId: string, gif: Gif) {
	updateGifs(accountId, collectionId, gifs =>
		gifs.filter(item => item.url !== gif.url),
	)
}

export function addGif(accountId: string, collectionId: string, gif: Gif) {
	updateGifs(accountId, collectionId, gifs =>
		gifs.some(item => item.url === gif.url) ? gifs : [...gifs, gif],
	)
}

export function moveGif(
	accountId: string,
	collectionId: string,
	url: string,
	direction: number,
) {
	updateGifs(accountId, collectionId, gifs =>
		moveItem(
			gifs,
			gifs.findIndex(gif => gif.url === url),
			direction,
		),
	)
}

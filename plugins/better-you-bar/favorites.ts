import { getStore, Stores } from '@revenge-mod/discord/flux'
import { getModules } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { after, instead } from '@revenge-mod/patcher'
import { defaults } from './Settings'
import type { JsonStorage } from '@revenge-mod/json-storage'
import type { PluginCleanupApi } from '@revenge-mod/plugins/types'
import type { Settings } from './Settings'

interface Favorite {
	id: string
	nickname: string | null
	type: number
	channelType: number
	order: number
	parentId: string | null
}

interface FavoriteStore {
	getFavoriteChannels(): Record<string, Favorite>
	getFavorite(id: string): Favorite | undefined
	isFavorite(id: string): boolean
	emitChange(): void
}

// Discord's server rejects favorites past the account limit, so extra ones live only in plugin storage.
export function patchLocalFavorites(
	storage: JsonStorage<Settings>,
	cleanup: PluginCleanupApi,
) {
	const settings = () => ({ ...defaults, ...storage.cache }) as Settings
	const local = () => (settings().localFavorites ? settings().favorites : [])
	const channels = Stores.ChannelStore as typeof Stores.ChannelStore & {
		getChannel(id: string): { type: number } | undefined
	}

	cleanup(
		getStore<FavoriteStore>('FavoriteStore', store => {
			// Store subscribers need a stable snapshot between changes.
			let base: Record<string, Favorite> | undefined
			let ids: string[] | undefined
			let merged: Record<string, Favorite> = {}
			const proto = Object.getPrototypeOf(store) as FavoriteStore
			cleanup(
				after(proto, 'getFavoriteChannels', result => {
					const favorites = local()
					if (!favorites.length) return result
					if (result !== base || favorites !== ids) {
						base = result
						ids = favorites
						merged = { ...result }
						favorites.forEach((id, order) => {
							merged[id] ??= {
								id,
								nickname: null,
								type: 1,
								channelType: channels.getChannel(id)?.type ?? 0,
								order: 1e6 + order,
								parentId: null,
							}
						})
					}
					return merged
				}),
				instead(proto, 'getFavorite', function (args, original) {
					return (
						Reflect.apply(original, this, args) ??
						store.getFavoriteChannels()[args[0]]
					)
				}),
				instead(proto, 'isFavorite', function (args, original) {
					return (
						Reflect.apply(original, this, args) || local().includes(args[0])
					)
				}),
				storage.subscribe(() => store.emitChange()),
			)
			store.emitChange()
		}),
		getModules(
			withProps<{
				addFavoriteChannels(options: { channelIds: string[] }): void
				removeFavoriteChannel(id: string): void
			}>('addFavoriteChannels', 'removeFavoriteChannel'),
			actions =>
				cleanup(
					instead(actions, 'addFavoriteChannels', function (args, original) {
						if (!settings().localFavorites)
							return Reflect.apply(original, this, args)
						storage.set({
							favorites: [
								...new Set([...settings().favorites, ...args[0].channelIds]),
							],
						})
					}),
					instead(actions, 'removeFavoriteChannel', function (args, original) {
						const { favorites } = settings()
						if (!favorites.includes(args[0]))
							return Reflect.apply(original, this, args)
						storage.set({ favorites: favorites.filter(id => id !== args[0]) })
					}),
				),
		),
	)

	for (const key of ['FREE_FAVORITE_LIMIT', 'MAX_FAVORITE_CHANNELS'])
		cleanup(
			getModules(withProps<Record<string, number>>(key), limits => {
				const limit = limits[key]
				const apply = () => {
					limits[key] = settings().localFavorites ? Infinity : limit
				}
				apply()
				cleanup(storage.subscribe(apply), () => {
					limits[key] = limit
				})
			}),
		)
}

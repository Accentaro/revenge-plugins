import { ToastActionCreators } from '@revenge-mod/discord/actions'
import { onFluxEventDispatched, Stores } from '@revenge-mod/discord/flux'
import { getModules, lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { after, instead } from '@revenge-mod/patcher'
import { patchPicker } from './picker'
import { registerShare } from './providers'
import { loadProviders } from './requests'
import GifProvidersSettings from './settings'
import {
	configureStorage,
	defaults,
	gifProvidersSettings,
	loadSettings,
	providerLabels,
	selectedProviders,
	setActive,
	useGifProvidersSettings,
} from './storage'
import type { GifProvidersSettings as SettingsData } from './storage'
import type {
	GifActions,
	GifViewStore,
	HttpRequest,
	RequestOptions,
} from './types'

const patches: (() => void)[] = []
const requests = new Map<string, AbortController>()
let generation = 0

function cancelRequests() {
	for (const controller of requests.values()) controller.abort()
	requests.clear()
}

function cleanup() {
	generation++
	cancelRequests()

	for (const unpatch of patches.splice(0).reverse()) {
		try {
			unpatch()
		} catch (error) {
			console.error('[GifProviders] Cleanup failed', error)
		}
	}
}

export default plugin<{ jsonStorage: SettingsData }>({
	jsonStorage: { default: defaults },
	SettingsComponent: GifProvidersSettings,
	async start({ cleanup: registerCleanup, jsonStorage, plugin }) {
		cleanup()
		registerCleanup(() => {
			setActive(false)
			cleanup()
		})
		if (plugin.startedLate) plugin.requireReload()
		const currentGeneration = generation
		configureStorage(jsonStorage)
		await loadSettings()
		if (generation !== currentGeneration) return
		setActive(true)
		let actions: GifActions | undefined
		patches.push(
			getModules(
				withProps<GifActions>('fetchTrendingGIFs', 'trackSelectGIF'),
				value => {
					if (generation === currentGeneration) actions = value
				},
			),
		)
		const http = lookupModule(
			withProps('HTTP', 'get', 'post', 'put', 'patch', 'del'),
		)[0]?.HTTP
		const viewStore = Stores.GIFPickerViewStore as unknown as GifViewStore

		if (!http || !viewStore)
			throw new Error('GIF Providers: native GIF modules unavailable')
		const get: HttpRequest = http.get.bind(http)

		try {
			patches.push(
				getModules(
					withProps('GIF_PROVIDER', 'getSearchPlaceholder'),
					provider => {
						if (generation !== currentGeneration) return
						patches.push(
							after(
								provider,
								'getSearchPlaceholder',
								(placeholder: unknown) => {
									const names = selectedProviders(
										gifProvidersSettings.providers,
									)
										.map(value => providerLabels[value])
										.join(', ')
									return typeof placeholder === 'string'
										? placeholder.replace(/klipy|tenor|giphy/gi, names)
										: placeholder
								},
							),
						)
					},
				),
			)

			patches.push(
				onFluxEventDispatched('GIF_PICKER_QUERY', payload => {
					if (payload.type === 'GIF_PICKER_QUERY') {
						requests.get('results')?.abort()
						requests.get('suggest')?.abort()
					}
					return payload
				}),
			)
			patches.push(
				instead(http, 'get', function (args: unknown[], original) {
					const [options] = args as [RequestOptions]
					const match =
						/^\/gifs\/(search|trending-gifs|trending|suggest|trending-search)$/.exec(
							options?.url,
						)
					if (!match) return Reflect.apply(original, this, args)

					const operation = match[1] as Parameters<typeof loadProviders>[0]
					const slot =
						operation === 'search' || operation === 'trending-gifs'
							? 'results'
							: operation
					requests.get(slot)?.abort()
					const controller = new AbortController()
					requests.set(slot, controller)
					const query =
						typeof options.query?.q === 'string' ? options.query.q : ''
					const locale =
						typeof options.query?.locale === 'string'
							? options.query.locale
							: 'en-US'
					const limit = Math.max(
						1,
						Math.min(Number(options.query?.limit) || 50, 250),
					)
					const format =
						typeof options.query?.media_format === 'string'
							? options.query.media_format
							: viewStore.getSelectedFormat()
					const pending = loadProviders(
						operation,
						query,
						limit,
						locale,
						format,
						controller.signal,
						get,
					)
						.then(body => ({ body }))
						.catch(error => {
							if (!controller.signal.aborted) {
								console.warn(`[GifProviders] ${operation} failed`, error)
								if (slot === 'results')
									ToastActionCreators.open('GIF_PROVIDERS_FAILED', {
										text: 'Could not load GIFs. Try another provider.',
										variant: 'critical',
									})
							}
							if (slot === 'results') throw error
							return {
								body:
									operation === 'trending' ? { categories: [], gifs: [] } : [],
							}
						})

					// The picker attaches .then callbacks that dispatch directly to Flux.
					// Skip obsolete callbacks: even its failure handler can clear a newer search.
					return {
						// biome-ignore lint/suspicious/noThenProperty: Native picker callbacks must ignore cancelled requests.
						then: (
							success?: (response: { body: unknown }) => unknown,
							failure?: (error: unknown) => unknown,
						) =>
							pending
								.then(
									response => {
										if (
											!controller.signal.aborted &&
											generation === currentGeneration
										)
											return success ? success(response) : response
									},
									error => {
										if (
											!controller.signal.aborted &&
											generation === currentGeneration
										) {
											if (failure) return failure(error)
											throw error
										}
									},
								)
								.finally(() => {
									if (requests.get(slot) === controller) requests.delete(slot)
								}),
					}
				}),
			)
			patches.push(
				instead(http, 'post', function (args: unknown[], original) {
					const [options] = args as [RequestOptions]
					if (
						options?.url !== '/gifs/select' ||
						typeof options.body?.id !== 'string'
					)
						return Reflect.apply(original, this, args)
					const match = /^(tenor|giphy|klipy):(.+)$/.exec(options.body.id)
					if (!match) return Reflect.apply(original, this, args)
					if (match[1] === 'klipy')
						return Reflect.apply(original, this, [
							{ ...options, body: { ...options.body, id: match[2] } },
							...args.slice(1),
						])
					if (match[1] === 'giphy') return Promise.resolve({ body: {} })

					const controller = new AbortController()
					const key = `share:${match[2]}`
					requests.get(key)?.abort()
					requests.set(key, controller)
					const timer = setTimeout(() => controller.abort(), 10000)

					return registerShare(
						{
							provider: 'tenor',
							query: String(options.body.q ?? ''),
							limit: 1,
							locale: 'en-US',
							quality: gifProvidersSettings.gridQuality,
							signal: controller.signal,
						},
						match[2],
					)
						.catch(error => {
							if (!controller.signal.aborted)
								console.warn('[GifProviders] Share registration failed', error)
						})
						.then(() => ({ body: {} }))
						.finally(() => {
							clearTimeout(timer)
							if (requests.get(key) === controller) requests.delete(key)
						})
				}),
			)
			patches.push(
				patchPicker(
					category => {
						if (generation !== currentGeneration || !actions) return
						const query: string = viewStore.getQuery()
						actions.resetSearch()
						actions.fetchTrending()
						actions.fetchTrendingSearchTerms()
						if (category === 'Trending') actions.fetchTrendingGIFs(50)
						else if (category !== 'Favorites' && query)
							actions.search(query, 'Search', true, 100)
					},
					error => plugin.reportError(error),
				),
			)
			patches.push(useGifProvidersSettings.subscribe(cancelRequests))
		} catch (error) {
			cleanup()
			throw error
		}
	},
})

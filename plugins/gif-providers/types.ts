import type { ReactElement, RefObject } from 'react'
import type { GridQuality, Provider } from './storage'

export interface Gif {
	id: string
	title: string
	url: string
	src: string
	gif_src: string
	width: number
	height: number
	preview?: string
}

export interface Category {
	name: string
	src: string
}

export interface Trending {
	categories: Category[]
	gifs: Pick<Gif, 'src'>[]
}

export interface RequestOptions {
	url: string
	query?: Record<string, unknown>
	body?: Record<string, unknown>
}

export type HttpRequest = (
	options: RequestOptions,
	...args: unknown[]
) => Promise<{ body: unknown }>

export interface ProviderRequest {
	provider: Exclude<Provider, 'klipy'>
	query: string
	limit: number
	locale: string
	quality: GridQuality
	signal: AbortSignal
}

export interface PickerHeaderProps {
	categoryType: string
	columnWidth: number
	onQueryClear: () => void
	onQueryChange: (query: string) => void
	onFavoritesQueryChange: (query: string) => void
	searchInputRef: RefObject<unknown>
}

export interface PickerControlsProps {
	header: ReactElement<PickerHeaderProps>
}

export interface ProviderSelectProps {
	compact?: boolean
}

export interface GifItemProps {
	item?: { id?: string }
}

export interface ProviderPillProps {
	provider: Provider
}

export interface GifActions {
	fetchTrendingGIFs(limit: number): void
	trackSelectGIF(...args: unknown[]): void
	search(
		query: string,
		category: string,
		immediate: boolean,
		limit: number,
	): void
	resetSearch(): void
	fetchTrending(): void
	fetchTrendingSearchTerms(): void
}
export interface GifViewStore {
	getQuery(): string
	getSelectedFormat(): string
}

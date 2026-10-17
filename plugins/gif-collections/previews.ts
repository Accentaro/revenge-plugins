import { lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import type { Collection } from './types'

export async function refreshCollectionPreviews(
	collections: Collection[],
	signal: AbortSignal,
): Promise<Collection[]> {
	const [attachments] = lookupModule(
		withProps<{
			isRefreshableAttachmentUrl(url: URL): boolean
			getSignedAttachmentExpiration(url: URL): number | null
		}>('isRefreshableAttachmentUrl', 'getSignedAttachmentExpiration'),
	)
	if (!attachments) throw new Error('Attachment URL refresh is unavailable.')
	const urls = [
		...new Set(collections.flatMap(c => c.gifs.map(g => g.src))),
	].filter(src => {
		const url = new URL(src)
		return (
			attachments.isRefreshableAttachmentUrl(url) &&
			(attachments.getSignedAttachmentExpiration(url) ?? 0) <= Date.now()
		)
	})
	if (!urls.length) return collections
	const [http] = lookupModule(
		withProps<{
			HTTP: {
				post(options: {
					url: string
					body: { attachment_urls: string[] }
					retries: number
				}): Promise<{
					body: {
						refreshed_urls: { original: string; refreshed: string | null }[]
					}
				}>
			}
		}>('HTTP'),
	)
	if (!http) throw new Error('Discord HTTP is unavailable.')
	const refreshed = new Map<string, string>()
	// Discord accepts up to 50 URLs per request; individual refreshes hit rate limits.
	for (let offset = 0; offset < urls.length && !signal.aborted; offset += 50) {
		const { body } = await http.HTTP.post({
			url: '/attachments/refresh-urls',
			body: { attachment_urls: urls.slice(offset, offset + 50) },
			retries: 3,
		})
		for (const { original, refreshed: src } of body.refreshed_urls)
			if (src) refreshed.set(original, src)
	}
	return collections.map(collection => ({
		...collection,
		gifs: collection.gifs.map(gif => {
			const src = refreshed.get(gif.src)
			return src ? { ...gif, src } : gif
		}),
	}))
}

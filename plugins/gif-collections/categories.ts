import type { CategoryProps, Collection, GridItem } from './types'

export function mainPickerItems(
	favourites: CategoryProps['item'],
	collections: Collection[],
	native: CategoryProps['item'][],
	onlyCollections: boolean,
	query: string,
): GridItem[] {
	const search = query.trim().toLowerCase()
	const categoryItem = (
		category: CategoryProps['item'],
		index: number,
	): GridItem => ({
		id: `native-${index}`,
		name: category.name,
		gifs: [],
		category,
	})
	return [
		categoryItem(favourites, 0),
		...collections.filter(item => item.name.toLowerCase().includes(search)),
		...(!onlyCollections && !search
			? native
					.filter(item => item.type !== 'Favorites')
					.map((item, index) => categoryItem(item, index + 1))
			: []),
	]
}

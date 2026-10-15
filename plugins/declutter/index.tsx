/** @jsxImportSource . */
import { getModuleWithImportedPath } from '@revenge-mod/discord/utils/modules/finders'
import { getModules } from '@revenge-mod/modules/finders'
import {
	createFilterGenerator,
	withName,
	withProps,
} from '@revenge-mod/modules/finders/filters'
import { after, instead } from '@revenge-mod/patcher'
import { ReactJSXRuntime } from '@revenge-mod/react'
import { afterJSX } from '@revenge-mod/react/jsx-runtime'
import React from 'react'
import { cosmeticFlag, isCosmeticPreview, sanitizeMessage } from './cosmetics'
import {
	DefaultSettings,
	filterPaymentRows,
	filterProfileTabs,
	resolveSettings,
	userAreaOptions,
} from './preferences'
import SettingsComponent from './settings'
import type { Filter } from '@revenge-mod/modules/finders/filters'
import type { PaymentRow, Settings } from './preferences'

type NativeModule = Record<string, unknown>
type NativeFunction = (...args: unknown[]) => unknown
type Transform = (args: unknown[], original: () => unknown) => unknown

function removeElements(
	tree: React.ReactNode,
	remove: (element: React.ReactElement<NativeModule>) => boolean,
): React.ReactNode {
	if (Array.isArray(tree)) {
		const children = tree
			.map(child => removeElements(child, remove))
			.filter((child, index) => child !== null || tree[index] === null)
		return children.length === tree.length &&
			children.every((child, index) => child === tree[index])
			? tree
			: children
	}
	if (!React.isValidElement<NativeModule>(tree)) return tree
	if (remove(tree)) return null
	const children = removeElements(
		tree.props.children as React.ReactNode,
		remove,
	)
	return children === tree.props.children
		? tree
		: React.cloneElement(tree, { children })
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	SettingsComponent,
	stop() {
		this.requireReload()
	},
	start({ cleanup, jsonStorage, plugin }) {
		const abort = new AbortController()
		cleanup(() => abort.abort())
		if (plugin.startedLate) plugin.requireReload()
		const settings = () => resolveSettings(jsonStorage.cache)
		const hidden = (flag: keyof Settings) =>
			!abort.signal.aborted && settings()[flag]
		const PreviewContext = React.createContext(false)
		function useActive() {
			return React.useSyncExternalStore(
				listener => {
					abort.signal.addEventListener('abort', listener)
					return () => abort.signal.removeEventListener('abort', listener)
				},
				() => !abort.signal.aborted,
			)
		}
		function Preview({ render }: { render: () => React.ReactNode }) {
			return render()
		}
		function preview(render: () => React.ReactNode, key?: React.Key | null) {
			return (
				<PreviewContext.Provider key={key} value={true}>
					<Preview render={render} />
				</PreviewContext.Provider>
			)
		}
		function Visibility({
			element,
			flag,
		}: {
			element: React.ReactElement
			flag: keyof Settings
		}) {
			const isPreview = React.useContext(PreviewContext)
			const active = useActive()
			const state = jsonStorage.use() ?? DefaultSettings
			return active && !isPreview && state[flag] ? null : element
		}
		const patch = (target: unknown, key: string, transform: Transform) => {
			if (
				!target ||
				typeof target !== 'object' ||
				typeof (target as NativeModule)[key] !== 'function'
			)
				throw new Error(`Declutter: native surface ${key} is unavailable`)
			cleanup(
				instead(
					target as Record<string, NativeFunction>,
					key,
					function (args, original) {
						return transform(args, () => Reflect.apply(original, this, args))
					},
				),
			)
		}
		const watch = (
			filter: Filter,
			install: (module: NativeModule) => void,
			returnNamespace = true,
		) =>
			cleanup(
				getModules(
					filter,
					module => {
						if (abort.signal.aborted) return
						try {
							install(module as NativeModule)
						} catch (error) {
							plugin.reportError(error)
						}
					},
					{ returnNamespace },
				),
			)
		const conceal = (target: unknown, key: string, flag: keyof Settings) =>
			patch(target, key, (_, original) => {
				const isPreview = React.useContext(PreviewContext)
				const result = original()
				return !isPreview && hidden(flag) ? null : result
			})

		watch(
			withProps('getServerThemeUserEnabled', 'useServerThemeUserEnabled'),
			module => {
				for (const key of [
					'getServerThemeUserEnabled',
					'useServerThemeUserEnabled',
				])
					patch(module, key, (_, original) => {
						const result = original()
						return hidden('disableServerThemes') ? false : result
					})
			},
		)
		watch(
			withProps(
				'useMobileBoostProgressBarEnabled',
				'getMobileBoostProgressBarEnabled',
			),
			module =>
				patch(module, 'useMobileBoostProgressBarEnabled', (_, original) => {
					const result = original()
					return hidden('hideServerBoostGoal') ? false : result
				}),
		)
		watch(withName('useGuildActionRows'), module =>
			patch(module, 'default', (_, original) => {
				const rows = original() as string[]
				return hidden('hideServerBoostGoal')
					? rows.filter(row => row !== 'guild-premium-progress-bar')
					: rows
			}),
		)
		watch(withProps('getMessagesItemHappeningNowHeight'), module => {
			patch(module.default, 'type', (_, original) => {
				const result = original()
				return hidden('hideDmActivityCards') ? null : result
			})
			patch(module, 'getMessagesItemHappeningNowHeight', (_, original) => {
				const result = original()
				return hidden('hideDmActivityCards') ? 0 : result
			})
		})

		watch(withName('useBadges'), module =>
			patch(module, 'default', (_, original) => {
				const result = original()
				return hidden('hideProfileBadges') ? [] : result
			}),
		)
		const singleProfileTabStates = new WeakSet<object>()
		// Profile tabs share Discord's segmented-control state; preserve unrelated controls.
		watch(withProps('useSegmentedControlState'), module =>
			patch(module, 'useSegmentedControlState', (args, original) => {
				const props = args[0] as { items?: { id: string }[] } | undefined
				if (hidden('hideProfileTabs') && Array.isArray(props?.items)) {
					const items = filterProfileTabs(props.items)
					if (items !== props.items) {
						args[0] = { ...props, items }
						const state = original()
						if (items.length === 1 && state && typeof state === 'object')
							singleProfileTabStates.add(state)
						return state
					}
				}
				return original()
			}),
		)
		cleanup(
			getModuleWithImportedPath<{
				Tabs: React.ComponentType<{ state: object }>
			}>('design/components/Tabs/native/Tabs.native.tsx', module => {
				if (abort.signal.aborted) return
				cleanup(
					afterJSX(module.Tabs, element =>
						hidden('hideProfileTabs') &&
						singleProfileTabStates.has(element.props.state)
							? null
							: element,
					),
				)
			}),
		)
		cleanup(
			getModuleWithImportedPath<{
				default: React.ComponentType
			}>('modules/virtual_currency/native/BalanceWidgetMenu.tsx', module => {
				if (abort.signal.aborted) return
				cleanup(
					afterJSX(module.default, element => (
						<Visibility
							key={element.key}
							element={element}
							flag="hideOrbsBalance"
						/>
					)),
				)
			}),
		)

		watch(withProps('useAvatarDecoration', 'getAvatarDecoration'), module =>
			conceal(module, 'useAvatarDecoration', 'hideAvatarDecorations'),
		)
		watch(
			withProps('useNameplate').and(
				createFilterGenerator(
					(_, _id, exports) =>
						exports !== null &&
						typeof exports === 'object' &&
						typeof exports.useNameplate === 'function',
					() => 'declutter.callableUseNameplate',
				)(),
			),
			module => conceal(module, 'useNameplate', 'hideNameplates'),
			false,
		)
		watch(withProps('usePreloadProfileEffect'), module =>
			conceal(module, 'default', 'hideProfileEffects'),
		)
		watch(withProps('GuildTagBadge', 'BaseGuildTagChiplet'), module => {
			for (const key of ['default', 'GuildTagBadge', 'BaseGuildTagChiplet'])
				conceal(module[key], 'type', 'hideGuildTags')
		})
		watch(withName('useDisplayNameStyles'), module =>
			conceal(module, 'default', 'hideDisplayNameStyles'),
		)
		watch(withProps('default', 'AvatarSizes', 'getStatusSize'), module =>
			patch(module.default, 'type', (_, original) => {
				const isPreview = React.useContext(PreviewContext)
				const result = original() as React.ReactNode
				return !isPreview && hidden('hideAvatarDecorations')
					? removeElements(
							result,
							element =>
								cosmeticFlag(element.props) === 'hideAvatarDecorations',
						)
					: result
			}),
		)
		watch(withProps('DisplayName', 'ProfileBadgeRows'), module =>
			patch(module, 'default', (_, original) => {
				const isPreview = React.useContext(PreviewContext)
				const result = original() as React.ReactNode
				return !isPreview && hidden('hideGuildTags')
					? removeElements(
							result,
							element =>
								'user' in element.props && 'showToastOnPress' in element.props,
						)
					: result
			}),
		)
		watch(
			withProps('useIsYouBarGuildTagEnabled', 'getIsYouBarGuildTagEnabled'),
			module =>
				patch(module, 'useIsYouBarGuildTagEnabled', (_, original) => {
					const result = original()
					return hidden('hideGuildTags') ? false : result
				}),
		)
		watch(withName('createMessageContent'), module =>
			patch(module, 'default', (_, original) => {
				const result = original()
				return abort.signal.aborted
					? result
					: sanitizeMessage(result, settings())
			}),
		)

		watch(withProps('CollectiblesShopV2'), module => {
			for (const key of ['default', 'CollectiblesShopV2'])
				patch(module, key, (_, original) =>
					preview(() => original() as React.ReactNode),
				)
		})
		watch(
			withProps(
				'COLLECTIBLES_SHOP_CARD_HEIGHT',
				'COLLECTIBLES_SHOP_CARD_WIDTH',
			),
			module =>
				patch(module.default, 'type', (_, original) =>
					preview(() => original() as React.ReactNode),
				),
		)
		for (const key of [
			'CollectiblesAnalyticsProvider',
			'IndividualProductPreview',
		])
			watch(withProps(key), module =>
				patch(module, key, (_, original) =>
					preview(() => original() as React.ReactNode),
				),
			)

		watch(
			withProps('toSettingListItems', 'getScoredSettingListSearchResultItems'),
			module => {
				for (const key of [
					'toSettingListItems',
					'getScoredSettingListSearchResultItems',
				])
					patch(module, key, (_, original) => {
						const rows = original() as PaymentRow[]
						return abort.signal.aborted
							? rows
							: filterPaymentRows(rows, settings())
					})
			},
		)
		watch(withProps('QuestDockQuestContent'), module =>
			patch(module.default, 'type', (_, original) => {
				const result = original()
				return hidden('hideQuestDock') ? null : result
			}),
		)
		watch(
			withProps('useIsMobileQuestDockRendered', 'useMobileQuestDockHeight'),
			module => {
				for (const key of [
					'useIsMobileQuestDockRendered',
					'useIsMobileQuestDockRenderedBase',
					'useMobileQuestDockHeight',
				])
					patch(module, key, (_, original) => {
						const result = original()
						return hidden('hideQuestDock')
							? key === 'useMobileQuestDockHeight'
								? 0
								: false
							: result
					})
			},
		)
		watch(withProps('useHasSettingsBadge'), module =>
			patch(module.default, 'type', (_, original) => {
				const tree = original() as React.ReactNode
				const keys = new Set<string>(
					userAreaOptions
						.filter(([flag]) => hidden(flag))
						.map(([, , key]) => key),
				)
				if (hidden('removeUserNitro')) keys.add('nitro-subscriber')
				return keys.size
					? removeElements(
							tree,
							element => element.key !== null && keys.has(String(element.key)),
						)
					: tree
			}),
		)

		// Unnamed native cosmetics and explicit profile previews lack stable exported component identities.
		// afterJSX requires an exact type; match Rain's rendering contracts for these surfaces only.
		const inspect = (element: React.ReactElement) => {
			if (
				abort.signal.aborted ||
				!element?.props ||
				typeof element.props !== 'object' ||
				typeof element.type === 'string'
			)
				return element
			const props = element.props as NativeModule
			if (isCosmeticPreview(props)) return preview(() => element, element.key)
			const flag = cosmeticFlag(props)
			return flag ? (
				<Visibility key={element.key} element={element} flag={flag} />
			) : (
				element
			)
		}
		cleanup(after(ReactJSXRuntime, 'jsx', inspect))
		cleanup(after(ReactJSXRuntime, 'jsxs', inspect))
	},
})

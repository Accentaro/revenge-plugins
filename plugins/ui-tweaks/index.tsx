import {
	getModules,
	lookupModule,
	lookupModules,
} from '@revenge-mod/modules/finders'
import {
	createFilterGenerator,
	withDependencies,
	withName,
	withProps,
} from '@revenge-mod/modules/finders/filters'
import { after, before, instead } from '@revenge-mod/patcher'
import { isValidElement } from 'react'
import { createChatUi } from './ChatUi'
import { registerGuildbar } from './Guildbar'
import { registerMessageSheet } from './MessageSheet'
import { registerServerHeader } from './ServerHeader'
import SettingsComponent, { defaults } from './Settings'
import { registerSettingsEditor } from './SettingsEditor'
import { registerYouBar } from './YouBar'
import type { ComponentType, NamedExoticComponent } from 'react'
import type {
	ChannelDetailsProps,
	HostProps,
	HostTree,
	SearchTabsOptions,
	SearchTabsState,
} from './ChatUi'
import type { Settings } from './Settings'

interface MemoComponent extends NamedExoticComponent<HostProps> {
	type: ((props: HostProps) => HostTree | null) & { displayName?: string }
}

function isMemo(value: unknown): value is MemoComponent {
	return (
		value !== null &&
		typeof value === 'object' &&
		'type' in value &&
		typeof value.type === 'function'
	)
}

const withMemoName = createFilterGenerator(
	([name]: [string], _id, value): value is MemoComponent =>
		isMemo(value) && (value.type.displayName ?? value.type.name) === name,
	([name]) => `uiTweaks.memo:${name}`,
)

let ui: ReturnType<typeof createChatUi> | undefined
function loadChannelDetails(): ComponentType<ChannelDetailsProps> | undefined {
	// These screen dependencies are available before chat or channel details first render.
	const anchors = [
		['useNativeStackNavigation', 'useStackNavigation'],
		['getIsScreenReaderEnabled', 'useIsScreenReaderEnabled'],
		['default', 'getSafeAreaInsets'],
		['getDeviceMetadata', 'trackAppUIViewed'],
	].map(
		([first, second]) =>
			lookupModule(withProps(first, second), { initialize: false })[1],
	)
	if (anchors.some(id => id === undefined)) return
	const filter = withDependencies<{ default: unknown }>(
		withDependencies.unordered(withDependencies.partial(anchors)),
	)
	// Discover without running factories; load only the unique details owner when opening chat.
	const [match, other] = lookupModules(filter, {
		initialize: false,
		cached: false,
	})
	if (!match || other) return
	const [namespace] = lookupModule(filter)
	const component = namespace?.default
	if (
		isMemo(component) &&
		(component.type.displayName ?? component.type.name) === 'ChannelDetails'
	)
		return component
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: defaults },
	SettingsComponent,
	preInit({ cleanup }) {
		// Subscribe before Discord captures the native Chat export in its imports.
		for (const name of ['StandaloneChannelScreen', 'ChatInput'] as const) {
			cleanup(
				getModules(withMemoName(name), component => {
					cleanup(
						instead(component, 'type', function (args, original) {
							const tree = original.apply(this, args)
							return (
								tree &&
								(name === 'ChatInput'
									? (ui?.ChatInput(tree, args[0].ref) ?? tree)
									: (ui?.StandaloneChannelScreen(tree) ?? tree))
							)
						}),
					)
				}),
			)
		}

		cleanup(
			getModules(withMemoName('MainTabsChannelScreenStack'), component => {
				cleanup(
					instead(component, 'type', function (args, original) {
						const tree = original.apply(this, args)
						return (
							tree &&
							(ui?.MainTabsChannelScreenStack(
								tree,
								args[0].screenStackActive,
							) ??
								tree)
						)
					}),
				)
			}),
		)

		cleanup(
			getModules(
				withName<(props: HostProps) => HostTree>('Chat'),
				namespace => {
					if (
						!('default' in namespace) ||
						typeof namespace.default !== 'function'
					)
						return
					cleanup(
						after(namespace, 'default', tree => {
							// DCDChat is the React name confirmed against ChatViewManager with DexKit.
							if (
								isValidElement<HostProps>(tree) &&
								typeof tree.props.onChatScrollPosition === 'function'
							)
								return ui?.Chat(tree) ?? tree
							return tree
						}),
					)
				},
				{ returnNamespace: true },
			),
		)

		cleanup(
			getModules(
				withProps<{
					useSearchSegmentedControlState(
						options: SearchTabsOptions,
					): SearchTabsState
				}>('useSearchSegmentedControlState'),
				namespace => {
					cleanup(
						before(namespace, 'useSearchSegmentedControlState', ([options]) => [
							ui?.useChatTab(options) ?? options,
						]),
					)
					cleanup(
						after(
							namespace,
							'useSearchSegmentedControlState',
							state => ui?.useChatTabState(state) ?? state,
						),
					)
				},
			),
		)

		cleanup(
			getModules(
				withProps<{
					SegmentedControlPages(props: {
						state: SearchTabsState['segmentedControlState']
					}): HostTree | null
				}>('SegmentedControlPages'),
				namespace => {
					cleanup(
						instead(
							namespace,
							'SegmentedControlPages',
							function (args, original) {
								const tree = original.apply(this, args)
								return (
									tree &&
									(ui?.SegmentedControlPages(tree, args[0].state) ?? tree)
								)
							},
						),
					)
				},
			),
		)

		cleanup(() => {
			ui = undefined
		})
	},
	start(api) {
		registerMessageSheet(api)
		registerSettingsEditor(api)
		ui = createChatUi(api, loadChannelDetails)
		registerServerHeader(api)
		registerYouBar(api, registerGuildbar(api))
		if (api.plugin.startedLate) api.plugin.requireReload()
	},
	stop({ plugin }) {
		plugin.requireReload()
	},
})

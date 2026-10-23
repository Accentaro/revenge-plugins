import { withStoreName } from '@revenge-mod/discord/flux'
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
import { instead } from '@revenge-mod/patcher'
import { afterJSX } from '@revenge-mod/react/jsx-runtime'
import { lookupGeneratedIconComponent } from '@revenge-mod/utils/discord'
import {
	Children,
	cloneElement,
	isValidElement,
	useEffect,
	useState,
	useSyncExternalStore,
} from 'react'
import { StyleSheet, View } from 'react-native'
import { defaults } from './Settings'
import type { PluginApi } from '@revenge-mod/plugins/types'
import type { ComponentType, ReactElement, ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import type { Settings } from './Settings'

interface FastListProps {
	sections: number[]
	initialScrollItem?: number
	initialScrollSection?: number
	getItemSize(section: number, item: number): number
	getRecyclerKey(
		type: string,
		section: number,
		item?: number,
	): string | undefined
	renderItem(section: number, item: number, list: unknown): ReactNode
	renderHeader(list: { scrollPosValue?: unknown }): ReactElement<GuildProps>
}
interface ChannelRowModule {
	default: ComponentType<{
		mode: string
		onPress(): void
		accessibilityRole: 'button'
		accessibilityLabel: string
		style: StyleProp<ViewStyle>
		icon: ReactNode
		name: ReactNode
	}>
	ChannelModes: { DEFAULT: string }
	BaseChannelName: ComponentType<{ mode: string; name: string }>
	BaseChannelIcon: ComponentType<{
		mode: string
		IconComponent: NonNullable<ReturnType<typeof lookupGeneratedIconComponent>>
	}>
}
interface GuildProps {
	guild: { id: string }
}
interface ElementProps {
	children?: ReactNode
	style?: StyleProp<ViewStyle>
	accessibilityHint?: string
	variant?: string
	useButtonComponent?: boolean
	useEventsButton?: boolean
	guildVisibility?: unknown
}
type Element = ReactElement<ElementProps>
type HeaderComponent = (props: GuildProps) => Element

export function registerServerHeader({
	cleanup,
	jsonStorage,
	plugin,
}: PluginApi<{ jsonStorage: Settings }>) {
	let active = true
	const listeners = new Set<() => void>()
	const subscribe = (listener: () => void) => {
		listeners.add(listener)
		return () => {
			listeners.delete(listener)
		}
	}
	cleanup(() => {
		active = false
		listeners.forEach(listener => listener())
	})
	function markRead(guildId: string) {
		const stores = [
			'GuildOnboardingPromptsStore',
			'ActiveJoinedThreadsStore',
			'ReadStateStore',
		].map(
			name =>
				lookupModule(withStoreName(name), {
					initialize: false,
				})[1],
		)
		if (stores.some(id => id === undefined)) {
			plugin.reportError('The server read-state stores are unavailable.')
			return
		}
		const [markGuildsAsRead] = lookupModule(
			withName<(ids: string[], source: string) => void>('markGuildsAsRead').and(
				withDependencies(withDependencies.unordered(stores)),
			),
		)
		if (!markGuildsAsRead) {
			plugin.reportError('The server mark-as-read action is unavailable.')
			return
		}
		markGuildsAsRead([guildId], 'ChannelList')
	}
	function ReadList({
		props,
		render,
	}: {
		props: FastListProps
		render(props: FastListProps): ReactNode
	}) {
		const enabled = useSyncExternalStore(subscribe, () => active)
		const [height, setHeight] = useState(44)
		const [row] = lookupModule(
			withProps<ChannelRowModule>(
				'ChannelModes',
				'BaseChannelName',
				'BaseChannelIcon',
			),
			{ initialize: false },
		)
		const Check = lookupGeneratedIconComponent('CheckmarkLargeIcon')
		const header = props.renderHeader({})
		const guildId = header?.props?.guild?.id
		if (!enabled || !row || !Check || !guildId || !props.sections.length)
			return render(props)
		const mode = row.ChannelModes.DEFAULT
		return render({
			...props,
			sections: [props.sections[0] + 1, ...props.sections.slice(1)],
			getItemSize: (section, item) =>
				section === 0 && item === props.sections[0]
					? height
					: props.getItemSize(section, item),
			getRecyclerKey: (type, section, item) =>
				type === 'ITEM' && section === 0 && item === props.sections[0]
					? 'ui-tweaks.mark-read'
					: props.getRecyclerKey(type, section, item),
			renderItem: (section, item, list) =>
				section === 0 && item === props.sections[0] ? (
					<View onLayout={event => setHeight(event.nativeEvent.layout.height)}>
						<row.default
							onPress={() => markRead(guildId)}
							accessibilityRole="button"
							accessibilityLabel="Mark all as read"
							style={{
								marginHorizontal: 8,
								marginVertical: StyleSheet.hairlineWidth,
								borderRadius: 12,
							}}
							mode={mode}
							icon={<row.BaseChannelIcon mode={mode} IconComponent={Check} />}
							name={<row.BaseChannelName mode={mode} name="Mark all as read" />}
						/>
					</View>
				) : (
					props.renderItem(section, item, list)
				),
		})
	}
	const withFastList = createFilterGenerator(
		(_args, _id, value): value is { type(props: FastListProps): ReactNode } =>
			!!value &&
			typeof value === 'object' &&
			'type' in value &&
			typeof value.type === 'function' &&
			(value.type.name === 'ChannelListFastList' ||
				('displayName' in value.type &&
					value.type.displayName === 'ChannelListFastList')),
		() => 'uiTweaks.channelListFastList',
	)
	cleanup(
		getModules(withFastList(), module => {
			cleanup(
				instead(module, 'type', (args, original) => (
					<ReadList props={args[0]} render={original} />
				)),
			)
		}),
	)
	let SheetHeader: HeaderComponent | undefined
	function loadHeader() {
		if (SheetHeader) return
		const anchors = [
			['getGuildTraits', 'isDiscoverableGuild'],
			['hasGuildBadge', 'default'],
			['useGradientTop', 'useGradientBottom'],
			['getIsWindowLarge', 'default'],
		].map(([a, b]) => lookupModule(withProps(a, b), { initialize: false })[1])
		if (anchors.some(id => id === undefined)) return
		const filter = withDependencies<{ default: HeaderComponent }>(
			withDependencies.unordered(withDependencies.partial(anchors)),
		)
		const [match, other] = lookupModules(filter, {
			initialize: false,
			cached: false,
		})
		if (!match || other) return
		const [module] = lookupModule(filter)
		if (module?.default?.name !== 'GuildActionSheetHeader') return
		SheetHeader = module.default
		listeners.forEach(listener => listener())
	}
	cleanup(
		getModules(
			withName<HeaderComponent>('GuildActionSheetHeader'),
			component => {
				SheetHeader = component
				listeners.forEach(listener => listener())
			},
		),
	)
	function CompactHeader(props: GuildProps) {
		const tree = SheetHeader!(props)
		const body = Children.toArray(tree.props.children).find(
			(child): child is Element =>
				isValidElement<ElementProps>(child) &&
				Array.isArray(child.props.children),
		)
		if (!body || !Array.isArray(body.props.children)) return tree
		// The channel list already owns the banner; retain only the sheet's name, badges and counts.
		const [icon, ...details] = body.props.children
		if (
			!isValidElement<ElementProps>(icon) ||
			!('accessibilityElementsHidden' in icon.props)
		)
			return tree
		return cloneElement(
			body,
			{ style: { paddingHorizontal: 16, paddingBottom: 8 } },
			details.map((child, index) =>
				isValidElement<ElementProps>(child)
					? cloneElement(
							child,
							{
								style: [
									child.props.style,
									{ marginTop: index === 0 ? 0 : 8 },
									Children.toArray(child.props.children).some(
										item =>
											isValidElement<ElementProps>(item) &&
											'guildVisibility' in item.props,
									) && {
										flexDirection: 'column',
										alignItems: 'flex-start',
										gap: 8,
									},
								],
							},
							index === 0
								? Children.map(child.props.children, title =>
										isValidElement<ElementProps>(title) && title.props.variant
											? cloneElement(title, { variant: 'heading-lg/semibold' })
											: title,
									)
								: child.props.children,
						)
					: child,
			),
		)
	}
	function replaceTitle(
		tree: ReactNode,
		guild: GuildProps['guild'],
	): ReactNode {
		if (!isValidElement<ElementProps>(tree)) return tree
		if (tree.props.accessibilityHint)
			return cloneElement(tree, {}, <CompactHeader guild={guild} />)
		return tree.props.children
			? cloneElement(
					tree,
					{},
					Children.map(tree.props.children, child =>
						replaceTitle(child, guild),
					),
				)
			: tree
	}
	cleanup(
		getModules(
			withName<HeaderComponent>('ChannelListStickyHeader'),
			NativeHeader => {
				function Header(props: GuildProps) {
					const tree = NativeHeader(props)
					const available = useSyncExternalStore(
						subscribe,
						() => active && !!SheetHeader,
					)
					const settings = { ...defaults, ...jsonStorage.use() }
					useEffect(() => {
						if (settings.improvedGuildHeader) loadHeader()
					}, [settings.improvedGuildHeader])
					return available && settings.improvedGuildHeader
						? replaceTitle(tree, props.guild)
						: tree
				}
				cleanup(
					afterJSX(NativeHeader, element => <Header {...element.props} />),
				)
			},
		),
	)
}

import { getAssetIdByName } from '@revenge-mod/assets'
import { Tokens } from '@revenge-mod/discord/common/tokens'
import { Design } from '@revenge-mod/discord/design'
import { Stores } from '@revenge-mod/discord/flux'
import { lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { lookupGeneratedIconComponent } from '@revenge-mod/utils/discord'
import {
	Children,
	cloneElement,
	isValidElement,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { Animated, PanResponder, View } from 'react-native'
import { barHapticFeedback } from './PullHandle'
import { defaults } from './Settings'
import { getDragLayout } from './sheetDrag'
import {
	applyOrder,
	defaultSurfacePreferences,
	movePreference,
} from './surfacePreferences'
import { componentName } from './surfaces'
import type { PluginApi } from '@revenge-mod/plugins/types'
import type {
	ComponentProps,
	ComponentType,
	ReactElement,
	ReactNode,
} from 'react'
import type { ViewStyle } from 'react-native'
import type { Settings } from './Settings'
import type { SurfacePreferences } from './surfacePreferences'
import type { SurfaceDefinition, SurfaceRowProps } from './surfaces'

export type SheetElement = ReactElement<
	ComponentProps<typeof Design.ActionSheet>
>
type GroupElement = ReactElement<{ children?: ReactNode }>
type Api = PluginApi<{ jsonStorage: Settings }>

// The host supports icon-only; the published IconButton type omits this variant.
type NativeIconButtonProps = Omit<
	ComponentProps<typeof Design.IconButton>,
	'variant'
> & {
	variant: ComponentProps<typeof Design.IconButton>['variant'] | 'icon-only'
}
function IconButton(props: NativeIconButtonProps) {
	const Button = Design.IconButton as ComponentType<NativeIconButtonProps>
	return <Button {...props} />
}

interface Entry {
	row: ReactNode
	key: string
	id?: string
}
export interface Group {
	element: GroupElement
	entries: Entry[]
}

function readGroups(sheet: SheetElement, surface: SurfaceDefinition): Group[] {
	const groups = Children.toArray(sheet.props.children).flatMap(element => {
		if (
			!isValidElement<{ children?: ReactNode }>(element) ||
			componentName(element.type) !== 'ActionSheetRowGroup'
		)
			throw new Error('Action groups changed; customisation was skipped')
		const entries = Children.toArray(element.props.children).map(
			(row, index) => ({
				row,
				key: isValidElement(row) && row.key !== null ? row.key : String(index),
				id:
					isValidElement<SurfaceRowProps>(row) &&
					row.type === Design.ActionSheetRow
						? surface.identify(row)
						: undefined,
			}),
		)
		return [{ element, entries }]
	})
	const counts = new Map<string, number>()
	for (const { entries } of groups)
		for (const { id } of entries)
			if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
	for (const { entries } of groups)
		for (const entry of entries)
			if (entry.id && counts.get(entry.id) !== 1) entry.id = undefined
	return groups
}

function VisibilityButton({
	hidden,
	label,
	onPress,
}: {
	hidden: boolean
	label: string
	onPress(): void
}) {
	return (
		<IconButton
			icon={getAssetIdByName(hidden ? 'EyeSlashIcon' : 'EyeIcon')!}
			variant="icon-only"
			size="sm"
			hitSlop={6}
			accessibilityLabel={`${hidden ? 'Show' : 'Hide'} ${label}`}
			onPress={onPress}
		/>
	)
}

export function EditableRow({
	entry,
	hidden,
	onToggle,
	onLayout,
	onDrag,
	onDrop,
	onCancel,
	shift,
	slot,
	cardStyle,
	spring,
	onStep,
}: {
	entry: Entry
	hidden: boolean
	onToggle(): void
	onLayout(y: number, height: number): void
	onDrag(dy: number): void
	onDrop(dy: number): { offset: number; commit(): void }
	onCancel(): void
	shift: number
	slot: number
	cardStyle: ViewStyle
	spring: Pick<Animated.SpringAnimationConfig, 'mass' | 'stiffness' | 'damping'>
	onStep(direction: number): void
}) {
	const AnimatedView = Animated.View
	const DragIcon = useMemo(() => lookupGeneratedIconComponent('DragIcon'), [])
	const [offset] = useState(() => new Animated.Value(0))
	const [dragging, setDragging] = useState(false)
	const [scale] = useState(() => new Animated.Value(1))
	const latest = useRef({ onDrag, onDrop, onCancel })
	latest.current = { onDrag, onDrop, onCancel }
	const reducedMotion =
		'useReducedMotion' in Stores.AccessibilityStore &&
		Stores.AccessibilityStore.useReducedMotion === true
	const animate = (
		value: Animated.Value,
		target: number,
		complete?: Animated.EndCallback,
		duration?: number,
	) => {
		value.stopAnimation()
		if (reducedMotion) {
			value.setValue(target)
			complete?.({ finished: true })
		} else if (duration !== undefined)
			Animated.timing(value, {
				duration,
				toValue: target,
				useNativeDriver: true,
			}).start(complete)
		else
			Animated.spring(value, {
				...spring,
				toValue: target,
				useNativeDriver: true,
			}).start(complete)
	}
	useLayoutEffect(() => {
		offset.stopAnimation()
		offset.setValue(0)
	}, [slot, offset])
	useEffect(() => {
		if (!dragging) animate(offset, shift)
	}, [shift, dragging])
	useEffect(
		() => () => {
			offset.stopAnimation()
			scale.stopAnimation()
		},
		[offset, scale],
	)
	const responder = useMemo(
		() =>
			PanResponder.create({
				onStartShouldSetPanResponder: () => true,
				onMoveShouldSetPanResponder: () => true,
				onPanResponderGrant: () => {
					offset.stopAnimation()
					setDragging(true)
					animate(scale, reducedMotion ? 1 : 1.025)
					latest.current.onDrag(0)
				},
				onPanResponderMove: (_event, gesture) => {
					offset.setValue(gesture.dy)
					latest.current.onDrag(gesture.dy)
				},
				onPanResponderRelease: (_event, gesture) => {
					const drop = latest.current.onDrop(gesture.dy)
					animate(scale, 1, undefined, 140)
					animate(
						offset,
						drop.offset,
						({ finished }) => {
							if (!finished) return
							setDragging(false)
							drop.commit()
						},
						140,
					)
				},
				onPanResponderTerminate: () => {
					latest.current.onCancel()
					animate(scale, 1, undefined, 140)
					animate(
						offset,
						0,
						({ finished }) => {
							if (finished) setDragging(false)
						},
						140,
					)
				},
				onPanResponderTerminationRequest: () => false,
			}),
		[offset, scale, spring],
	)
	const label =
		isValidElement<SurfaceRowProps>(entry.row) &&
		typeof entry.row.props.label === 'string'
			? entry.row.props.label
			: 'action'
	const controls = entry.id ? (
		<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
			<VisibilityButton hidden={hidden} label={label} onPress={onToggle} />
			<View
				{...responder.panHandlers}
				accessible
				accessibilityRole="adjustable"
				accessibilityLabel={`Reorder ${label}`}
				accessibilityHint="Drag within this group, or use the move actions"
				accessibilityActions={[
					{ name: 'increment', label: 'Move down' },
					{ name: 'decrement', label: 'Move up' },
				]}
				onAccessibilityAction={event =>
					onStep(event.nativeEvent.actionName === 'increment' ? 1 : -1)
				}
				hitSlop={6}
				style={{
					width: 32,
					height: 32,
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				{DragIcon && <DragIcon size="sm" />}
			</View>
		</View>
	) : undefined
	return (
		<AnimatedView
			onLayout={event =>
				onLayout(event.nativeEvent.layout.y, event.nativeEvent.layout.height)
			}
			style={[
				dragging && cardStyle,
				{
					opacity: hidden ? 0.4 : 1,
					zIndex: dragging ? 1 : 0,
					transform: [{ translateY: offset }, { scale }],
					elevation: dragging ? 12 : 0,
					shadowColor: '#000',
					shadowOpacity: dragging ? 0.22 : 0,
					shadowRadius: 8,
					shadowOffset: { width: 0, height: 4 },
				},
			]}
		>
			{entry.id && isValidElement<SurfaceRowProps>(entry.row) ? (
				cloneElement(entry.row, {
					onPress: undefined,
					arrow: false,
					trailing: controls,
				})
			) : (
				<View
					pointerEvents="none"
					accessibilityElementsHidden
					importantForAccessibility="no-hide-descendants"
				>
					{entry.row}
				</View>
			)}
		</AnimatedView>
	)
}

export function EditableGroup(props: ComponentProps<typeof DraggableGroup>) {
	if (props.editing) return <DraggableGroup {...props} />
	const { group, preferences } = props
	const children = applyOrder(
		group.entries,
		preferences.order,
		entry => entry.id,
	)
		.filter(entry => !entry.id || !preferences.hidden.includes(entry.id))
		.map(entry => entry.row)
	return children.length ? cloneElement(group.element, { children }) : null
}

function DraggableGroup({
	group,
	preferences,
	onChange,
	RowComponent = EditableRow,
}: {
	group: Group
	RowComponent?: ComponentType<ComponentProps<typeof EditableRow>>
	preferences: SurfacePreferences
	editing: boolean
	onChange(preferences: SurfacePreferences): void
}) {
	const [drag, setDrag] = useState<{
		key: string
		layout: ReturnType<typeof getDragLayout>
	}>()
	const dragTarget = useRef<number | undefined>(undefined)
	const spring = useMemo(() => {
		const [motion] = lookupModule(
			withProps<{
				SUBTLE_SPRING: Pick<
					Animated.SpringAnimationConfig,
					'mass' | 'stiffness' | 'damping'
				>
				springStandard: unknown
			}>('SUBTLE_SPRING', 'springStandard'),
			{ initialize: false },
		)
		if (!motion) throw Error('Action sheet drag animation is unavailable')
		return motion.SUBTLE_SPRING
	}, [])
	const useStyles = useMemo(
		() =>
			Design.createStyles({
				card: {
					backgroundColor: Tokens.default.colors.BACKGROUND_SURFACE_HIGH,
					borderRadius: 12,
				},
			}),
		[],
	)
	const styles = useStyles()
	const geometry = useRef(new Map<string, { y: number; height: number }>())
	const entries = useMemo(
		() => applyOrder(group.entries, preferences.order, entry => entry.id),
		[group, preferences.order],
	)
	const movable = entries.filter(entry => !!entry.id)
	function layout(from: number, dy: number) {
		const bounds = movable.map(entry => ({
			key: entry.key,
			...geometry.current.get(entry.key)!,
		}))
		return getDragLayout(bounds, from, dy)
	}
	function move(from: number, to: number) {
		onChange(
			movePreference(
				preferences,
				movable.map(entry => entry.id!),
				from,
				to,
			),
		)
	}
	const children = entries.flatMap<ReactNode>(entry => {
		const hidden = !!entry.id && preferences.hidden.includes(entry.id)
		const from = movable.indexOf(entry)
		return [
			<RowComponent
				key={entry.key}
				entry={entry}
				hidden={hidden}
				shift={
					drag?.key === entry.key ? 0 : (drag?.layout.offsets[entry.key] ?? 0)
				}
				slot={entries.indexOf(entry)}
				cardStyle={styles.card}
				spring={spring}
				onCancel={() => {
					dragTarget.current = undefined
					setDrag(undefined)
				}}
				onDrag={dy => {
					const next = layout(from, dy)
					if (next.to !== (dragTarget.current ?? from)) barHapticFeedback()
					dragTarget.current = next.to
					setDrag(previous =>
						previous?.key === entry.key && previous.layout.to === next.to
							? previous
							: { key: entry.key, layout: next },
					)
				}}
				onLayout={(y, height) => geometry.current.set(entry.key, { y, height })}
				onToggle={() =>
					entry.id &&
					onChange({
						...preferences,
						hidden: hidden
							? preferences.hidden.filter(id => id !== entry.id)
							: [...preferences.hidden, entry.id],
					})
				}
				onStep={direction =>
					move(
						from,
						Math.max(0, Math.min(movable.length - 1, from + direction)),
					)
				}
				onDrop={dy => {
					const next = layout(from, dy)
					return {
						offset: next.offsets[entry.key] ?? 0,
						commit() {
							dragTarget.current = undefined
							setDrag(undefined)
							move(from, next.to)
						},
					}
				}}
			/>,
		]
	})
	return children.length ? cloneElement(group.element, { children }) : null
}

export function useSurfaceEditor(api: Api, surfaceId: string) {
	const stored = api.jsonStorage.use()
	const preferences = stored?.surfaces?.[surfaceId] ?? defaultSurfacePreferences
	const [editing, setEditing] = useState(false)
	const [undo, setUndo] = useState<SurfacePreferences>()
	function save(next: SurfacePreferences) {
		if (next === preferences || !api.jsonStorage.loaded) return
		setUndo({ hidden: [...preferences.hidden], order: [...preferences.order] })
		api.jsonStorage
			.set({ surfaces: { [surfaceId]: next } })
			.catch(error => api.plugin.reportError(error))
	}
	return { preferences, editing, setEditing, undo, setUndo, save }
}

export function EditorToolbar({
	api,
	surfaceId,
	editor,
}: {
	api: Api
	surfaceId: string
	editor: ReturnType<typeof useSurfaceEditor>
}) {
	const { preferences, editing, setEditing, undo, setUndo, save } = editor
	return (
		<Design.Stack
			direction="horizontal"
			spacing={8}
			align="center"
			justify="flex-end"
			style={{
				flexShrink: 0,
				flexWrap: 'wrap',
				paddingVertical: editing ? 8 : 0,
			}}
		>
			{editing ? (
				<>
					<Design.Button
						text="Undo"
						size="md"
						variant="secondary"
						disabled={!undo}
						onPress={() => {
							if (undo) {
								save(undo)
								setUndo(undefined)
							}
						}}
					/>
					<Design.Button
						text="Reset"
						size="md"
						variant="secondary"
						disabled={!preferences.hidden.length && !preferences.order.length}
						onPress={() => save(defaultSurfacePreferences)}
					/>
					<Design.Button
						text="Done"
						size="md"
						onPress={() => setEditing(false)}
					/>
				</>
			) : (
				<IconButton
					icon={getAssetIdByName('SettingsIcon')!}
					variant="icon-only"
					size="sm"
					accessibilityLabel={`Customise ${surfaceId} actions`}
					disabled={!api.jsonStorage.loaded}
					onPress={() => setEditing(true)}
				/>
			)}
		</Design.Stack>
	)
}

function EditableSheet({
	sheet,
	surface,
	api,
}: {
	sheet: SheetElement
	surface: SurfaceDefinition
	api: Api
}) {
	const editor = useSurfaceEditor(api, surface.id)
	const { preferences, editing, save } = editor
	const groups = useMemo(() => readGroups(sheet, surface), [sheet, surface])
	const headerId = surface.identifyHeader(sheet.props.header)
	const headerHidden = !!headerId && preferences.hidden.includes(headerId)
	const header = (
		<View style={{ flexShrink: 0 }}>
			<EditorToolbar api={api} surfaceId={surface.id} editor={editor} />
			{editing && headerId ? (
				<View style={{ flexDirection: 'row', alignItems: 'center' }}>
					<Design.Text variant="text-sm/medium" style={{ flex: 1 }}>
						Reactions
					</Design.Text>
					<VisibilityButton
						hidden={headerHidden}
						label="reactions"
						onPress={() =>
							save({
								...preferences,
								hidden: headerHidden
									? preferences.hidden.filter(id => id !== headerId)
									: [...preferences.hidden, headerId],
							})
						}
					/>
				</View>
			) : null}
			{editing ? (
				<View
					pointerEvents="none"
					accessibilityElementsHidden
					importantForAccessibility="no-hide-descendants"
					style={{ opacity: headerHidden ? 0.4 : 1 }}
				>
					{sheet.props.header}
				</View>
			) : headerHidden ? null : (
				sheet.props.header
			)}
		</View>
	)
	return cloneElement(sheet, {
		header,
		children: groups.map(group => (
			<EditableGroup
				key={group.element.key}
				group={group}
				preferences={preferences}
				editing={editing}
				onChange={save}
			/>
		)),
	})
}

export default function SheetEditor(
	props: ComponentProps<typeof EditableSheet>,
) {
	const enabled =
		props.api.jsonStorage.use()?.customizeMessageActions ??
		defaults.customizeMessageActions
	return enabled ? <EditableSheet {...props} /> : props.sheet
}

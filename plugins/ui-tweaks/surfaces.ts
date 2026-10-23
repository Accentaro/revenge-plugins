import { lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { isValidElement } from 'react'
import { createMessageLabelResolver } from './messageLabels'
import type { ComponentType, ReactElement, ReactNode } from 'react'
import type { MessageCatalog } from './messageLabels'

export interface SurfaceRowProps {
	label?: ReactNode
	arrow?: boolean
	trailing?: ReactNode
	icon?: ReactNode
	onPress?: (...args: unknown[]) => unknown
	children?: ReactNode
}
export type SurfaceRow = ReactElement<SurfaceRowProps>
export interface SurfaceDefinition {
	id: string
	identify(row: SurfaceRow): string | undefined
	identifyHeader(header: ReactNode): string | undefined
}

const messageActions: Record<string, string> = {
	ArrowAngleLeftUpIcon: 'reply',
	ForwardingIcon: 'forward',
	ThreadIcon: 'thread',
	CopyIcon: 'copy-text',
	ChatMarkUnreadIcon: 'mark-unread',
	PinIcon: 'pin',
	BookmarkOutlineIcon: 'bookmark',
	ClockIcon: 'reminder',
	RobotIcon: 'apps',
	AtIcon: 'mention',
	DownloadIcon: 'save-media',
	IdIcon: 'copy-id',
	TrashIcon: 'delete',
}

export function componentName(type: unknown): string | undefined {
	return typeof type === 'function' ? type.name : undefined
}

export function createMessageSurface(): SurfaceDefinition {
	let identifyLabel: ReturnType<typeof createMessageLabelResolver> | undefined
	return {
		id: 'message',
		identify(row) {
			const icon = row.props.icon
			if (
				!isValidElement<{ IconComponent?: ComponentType }>(icon) ||
				componentName(icon.type) !== 'ActionSheetRowIcon'
			)
				return
			const name = componentName(icon.props.IconComponent) ?? ''
			if (name !== 'PencilIcon' && name !== 'LinkIcon')
				return messageActions[name]
			if (!identifyLabel) {
				const [catalog] = lookupModule(withProps<MessageCatalog>('intl', 't'), {
					initialize: false,
				})
				if (!catalog) return
				identifyLabel = createMessageLabelResolver(catalog)
			}
			return identifyLabel(name, row.props.label)
		},
		identifyHeader(header) {
			if (isValidElement(header) && componentName(header.type) === 'EmojiRow')
				return 'reactions'
		},
	}
}

const channelActions: Record<string, string> = {
	UserCircleIcon: 'profile',
	UserMinusIcon: 'close',
	StarOutlineIcon: 'favorite',
	StarIcon: 'favorite',
	GroupPlusIcon: 'invite',
	PinIcon: 'pin',
	LinkIcon: 'copy-link',
	EyeIcon: 'mark-read',
	BellSlashIcon: 'mute',
	BellIcon: 'mute',
	ChannelNotificationIcon: 'notifications',
	SettingsIcon: 'edit',
	CopyIcon: 'duplicate',
	IdIcon: 'copy-id',
}

export function createChannelSurface(id: 'dm' | 'channel'): SurfaceDefinition {
	return {
		id,
		identify(row) {
			const icon = row.props.icon
			if (
				isValidElement<{ IconComponent?: ComponentType }>(icon) &&
				componentName(icon.type) === 'ActionSheetRowIcon'
			)
				return channelActions[componentName(icon.props.IconComponent) ?? '']
		},
		identifyHeader() {
			return undefined
		},
	}
}

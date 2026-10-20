import { onImportedPath, safeInstead } from '../modules'
import { getSettings } from '../state'
import type { DeclutterSettings } from '../../types'

interface MessageContent {
	avatarDecorationURL?: string | null
	clanTagGuildId?: string | null
	clanTag?: string | null
	clanBadgeUrl?: string | null
	referencedMessage?: { message?: MessageContent }
}

export function hideMessageClutter(
	content: MessageContent,
	settings: Pick<DeclutterSettings, 'avatarDecorations' | 'serverTags'>,
): MessageContent {
	const changes: Partial<MessageContent> = {}
	if (settings.avatarDecorations && content.avatarDecorationURL != null)
		changes.avatarDecorationURL = null
	if (settings.serverTags) {
		for (const key of ['clanTagGuildId', 'clanTag', 'clanBadgeUrl'] as const)
			if (content[key] != null) changes[key] = null
		const reply = content.referencedMessage?.message
		if (reply) {
			const message = hideMessageClutter(reply, {
				avatarDecorations: false,
				serverTags: true,
			})
			if (message !== reply)
				changes.referencedMessage = { ...content.referencedMessage, message }
		}
	}
	return Object.keys(changes).length ? { ...content, ...changes } : content
}

export function patchMessageClutter(): () => void {
	const unpatch: Array<() => void> = []
	unpatch.push(
		onImportedPath<{
			default: (...args: unknown[]) => MessageContent | null
		}>('modules/messages/native/renderer/createMessageContent.tsx', ns => {
			unpatch.push(
				safeInstead(ns, 'default', function (args, original) {
					const content = Reflect.apply(original, this, args)
					return content ? hideMessageClutter(content, getSettings()) : content
				}),
			)
		}),
	)
	return () => {
		for (const un of unpatch) un()
	}
}

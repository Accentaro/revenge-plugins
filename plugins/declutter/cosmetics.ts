import type { ExtraClutterSettings } from './preferences'

export function isCosmeticPreview(props: Record<string, unknown>): boolean {
	return (
		(props.isPreviewingChanges === true &&
			'collectibleProfileOverrides' in props) ||
		('profileEffectOverride' in props &&
			'avatarDecorationOverride' in props &&
			'profileFrameOverride' in props)
	)
}

export function sanitizeMessage(
	value: unknown,
	settings: ExtraClutterSettings,
): unknown {
	if (!value || typeof value !== 'object') return value
	const result = value as Record<string, unknown> & {
		referencedMessage?: { message?: Record<string, unknown> }
	}
	const changes: Record<string, unknown> = {}
	const fields = [
		...(settings.hideAvatarDecorations
			? [
					'avatarDecorationURL',
					'avatarDecorationUrl',
					'guildMemberAvatarDecoration',
				]
			: []),
		...(settings.hideDisplayNameStyles ? ['displayNameStyles'] : []),
		...(settings.hideGuildTags
			? ['clanTagGuildId', 'clanTag', 'clanBadgeUrl']
			: []),
	]
	for (const key of fields) if (result[key] != null) changes[key] = null
	const reply = result.referencedMessage?.message
	if (
		settings.hideGuildTags &&
		reply &&
		[reply.clanTagGuildId, reply.clanTag, reply.clanBadgeUrl].some(
			value => value != null,
		)
	) {
		changes.referencedMessage = {
			...result.referencedMessage,
			message: {
				...reply,
				clanTagGuildId: null,
				clanTag: null,
				clanBadgeUrl: null,
			},
		}
	}
	return Object.keys(changes).length ? { ...result, ...changes } : result
}
export function cosmeticFlag(
	props: Record<string, unknown>,
): keyof ExtraClutterSettings | undefined {
	if (
		'avatarDecoration' in props &&
		'decorationStyle' in props &&
		'cutout' in props &&
		'size' in props
	)
		return 'hideAvatarDecorations'
	if (
		'nameplate' in props &&
		(('barWidth' in props &&
			'avatarSize' in props &&
			'isQuestRendered' in props) ||
			'isFocused' in props ||
			'isPressed' in props ||
			'isSquarePreview' in props)
	)
		return 'hideNameplates'
	if (
		'frame' in props &&
		'containerWidth' in props &&
		'containerHeight' in props &&
		'frameOrder' in props
	)
		return 'hideProfileFrames'
}

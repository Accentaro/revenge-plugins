type MessageToken = (locale: string) => { reserialize(): string }

export interface MessageCatalog {
	intl: { string(token: MessageToken): string }
	t: Record<string, MessageToken>
}

const definitions = [
	{ source: 'Edit Message', icon: 'PencilIcon', id: 'edit-message' },
	{ source: 'Modify Attachment', icon: 'PencilIcon', id: 'modify-attachment' },
	{ source: 'Copy Message Link', icon: 'LinkIcon', id: 'copy-message-link' },
	{ source: 'Copy Image Link', icon: 'LinkIcon', id: 'copy-media-link' },
	{ source: 'Copy Media Link', icon: 'LinkIcon', id: 'copy-media-link' },
]

export function createMessageLabelResolver(catalog: MessageCatalog) {
	const sources = new Set(definitions.map(action => action.source))
	const tokens = new Map<string, MessageToken | undefined>()
	// Discover tokens from source messages; obfuscated catalog keys are never saved.
	for (const token of Object.values(catalog.t)) {
		const source = token('en-US').reserialize()
		if (sources.has(source))
			tokens.set(source, tokens.has(source) ? undefined : token)
	}
	const actions = definitions.flatMap(action => {
		const token = tokens.get(action.source)
		return token ? [{ ...action, token }] : []
	})
	return (icon: string, label: unknown): string | undefined => {
		const matches = new Set(
			actions
				.filter(
					action =>
						action.icon === icon && catalog.intl.string(action.token) === label,
				)
				.map(action => action.id),
		)
		return matches.size === 1 ? matches.values().next().value : undefined
	}
}

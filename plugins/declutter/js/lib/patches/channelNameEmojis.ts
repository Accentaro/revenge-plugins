import React from 'react'
import { onImportedPath, safeInstead } from '../modules'
import { getSettings } from '../state'
import type { ReactNode } from 'react'

interface UnicodeEmojis {
	default: {
		findInlineEmojisFromSurrogates(
			text: string,
		): Array<
			{ type: 'text'; text: string } | { type: 'emoji'; surrogate: string }
		>
	}
}

export function stripChannelEmojis(
	name: string,
	emojis: UnicodeEmojis['default'],
): string {
	const parts = emojis.findInlineEmojisFromSurrogates(name)
	if (!parts.some(part => part.type === 'emoji')) return name
	const text = parts
		.map(part => (part.type === 'text' ? part.text : ''))
		.join('')
	return (
		text
			.replace(
				/^[\s\u30fb\u00b7\u2022|\u2502\u2503-]+|[\s\u30fb\u00b7\u2022|\u2502\u2503-]+$/g,
				'',
			)
			.trim() || name
	)
}

function replaceName(
	node: ReactNode,
	name: string,
	replacement: string,
): ReactNode {
	if (typeof node === 'string') return node === name ? replacement : node
	if (Array.isArray(node))
		return node.map(child => replaceName(child, name, replacement))
	if (
		!React.isValidElement<{ children?: ReactNode; placeholder?: string }>(node)
	)
		return node
	const { children, placeholder } = node.props
	const next = replaceName(children, name, replacement)
	const nextPlaceholder =
		typeof placeholder === 'string' && placeholder.endsWith(name)
			? placeholder.slice(0, -name.length) + replacement
			: placeholder
	return next === children && nextPlaceholder === placeholder
		? node
		: React.cloneElement(node, {
				children: next,
				...(nextPlaceholder !== placeholder
					? { placeholder: nextPlaceholder }
					: {}),
			})
}

export function patchChannelNameEmojis(): () => void {
	const unpatch: Array<() => void> = []

	unpatch.push(
		onImportedPath<UnicodeEmojis>(
			'modules/emojis/UnicodeEmojis.tsx',
			emojis => {
				const transform = function (
					this: unknown,
					args: unknown[],
					original: (...args: unknown[]) => ReactNode,
				) {
					const result = Reflect.apply(original, this, args)
					const props = args[0] as { name?: string; channel?: { name: string } }
					const name = props.channel?.name ?? props.name
					if (!getSettings().channelNameEmojis || typeof name !== 'string')
						return result
					const text = stripChannelEmojis(name, emojis.default)
					return text === name ? result : replaceName(result, name, text)
				}
				for (const path of [
					'modules/chat_input/native/ChatInput.tsx',
					'modules/channel_list_v2/native/items/TextChannel.tsx',
				])
					unpatch.push(
						onImportedPath<{
							default: { type: (...args: unknown[]) => ReactNode }
						}>(path, ns => {
							unpatch.push(safeInstead(ns.default, 'type', transform))
						}),
					)

				unpatch.push(
					onImportedPath<{
						renderChannelTitle: (
							name: string,
							options: { guildId?: string; accessibleTitle?: string },
						) => ReactNode
					}>(
						'modules/main_tabs_v2/native/channel/header/ChannelHeaderShared.tsx',
						ns => {
							unpatch.push(
								safeInstead(
									ns,
									'renderChannelTitle',
									function (args, original) {
										const [name, options] = args
										if (!getSettings().channelNameEmojis || !options?.guildId)
											return Reflect.apply(original, this, args)
										const text = stripChannelEmojis(name, emojis.default)
										return Reflect.apply(original, this, [
											text,
											{
												...options,
												accessibleTitle: options.accessibleTitle?.replace(
													name,
													text,
												),
											},
										])
									},
								),
							)
						},
					),
					onImportedPath<{
						default: {
							type: (props: { channel: { name: string } }) => ReactNode
						}
					}>(
						'modules/main_tabs_v2/native/sidebar/details/header_v2/ChannelNameHeader.tsx',
						ns => {
							unpatch.push(
								safeInstead(ns.default, 'type', function (args, original) {
									const [props] = args
									if (!getSettings().channelNameEmojis)
										return Reflect.apply(original, this, args)
									const name = stripChannelEmojis(
										props.channel.name,
										emojis.default,
									)
									if (name === props.channel.name)
										return Reflect.apply(original, this, args)
									// Display copy for private header children; preserve the stored record.
									const channel = Object.assign(
										Object.create(Object.getPrototypeOf(props.channel)),
										props.channel,
										{ name },
									)
									return Reflect.apply(original, this, [
										{ ...props, channel },
										...args.slice(1),
									])
								}),
							)
						},
					),
					onImportedPath<{
						BaseChannelName: (...args: unknown[]) => ReactNode
					}>('modules/guild_sidebar/native/BaseChannelItem.tsx', ns => {
						unpatch.push(safeInstead(ns, 'BaseChannelName', transform))
					}),

					onImportedPath<{
						CategoryChannel: (...args: unknown[]) => ReactNode
					}>(
						'modules/channel_list_v2/native/items/RedesignCategory.tsx',
						ns => {
							unpatch.push(safeInstead(ns, 'CategoryChannel', transform))
						},
					),
				)
			},
		),
	)

	return () => {
		for (const un of unpatch) un?.()
	}
}

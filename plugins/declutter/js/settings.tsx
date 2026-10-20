import { DEFAULTS } from './defaults'
import { PAYMENT_OPTIONS } from './lib/patches/settingsPage'
import { isServerDrawerRunning } from './lib/state'
import type { PluginApi } from '@revenge-mod/plugins/types'
import type { DeclutterSettings } from './types'

function Toggle({
	s,
	set,
	key_,
	label,
	subLabel,
	disabled,
}: {
	s: DeclutterSettings
	set: (patch: Partial<DeclutterSettings>) => void
	key_: keyof DeclutterSettings
	label: string
	subLabel?: string
	disabled?: boolean
}) {
	const { TableSwitchRow } = revenge.discord.design.Design
	return (
		<TableSwitchRow
			label={label}
			subLabel={subLabel}
			value={disabled ? false : s[key_]}
			onValueChange={v => set({ [key_]: v } as Partial<DeclutterSettings>)}
			disabled={disabled}
		/>
	)
}

export default function Settings({
	api,
}: {
	api: PluginApi<{ jsonStorage: DeclutterSettings }>
}) {
	const { Page } =
		revenge.components as typeof import('@revenge-mod/components')
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup } = revenge.discord.design.Design

	const serverDrawer = isServerDrawerRunning()
	const raw = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }
	const s = serverDrawer ? { ...raw, questDock: false } : raw
	const set = (patch: Partial<DeclutterSettings>) =>
		api.jsonStorage.set({ ...raw, ...patch })

	return (
		<Page>
			<ScrollView contentContainerStyle={{ padding: 0 }}>
				<Stack>
					<TableRowGroup title="Hide">
						<Toggle
							s={s}
							set={set}
							key_="channelNameEmojis"
							label="Channel Name Emojis"
							subLabel="Hide emojis and surrounding separators in channel lists, headers, and the message box. Applies after restarting."
						/>
						<Toggle
							s={s}
							set={set}
							key_="avatarDecorations"
							label="Avatar Decorations"
							subLabel="Chat, DM list, member lists, and profiles"
						/>
						<Toggle
							s={s}
							set={set}
							key_="nameplates"
							label="Nameplates"
							subLabel="Collectible gradient nameplates behind usernames"
						/>
						<Toggle
							s={s}
							set={set}
							key_="profileEffects"
							label="Profile Effects"
							subLabel="Animated effects on user profiles"
						/>
						<Toggle
							s={s}
							set={set}
							key_="profileFrames"
							label="Profile Frames"
							subLabel="Collectible frames around profile avatars"
						/>
						<Toggle
							s={s}
							set={set}
							key_="serverTags"
							label="Server Tags"
							subLabel="Clan tags in chat, DM list, and profiles"
						/>
						<Toggle
							s={s}
							set={set}
							key_="badges"
							label="Profile Badges"
							subLabel="Badges shown on user profiles"
						/>
						<Toggle
							s={s}
							set={set}
							key_="wishlist"
							label="Wishlist & Board"
							subLabel="Wishlist & Board tabs on user profiles"
						/>
						<Toggle
							s={s}
							set={set}
							key_="boostGoal"
							label="Boost Goal"
							subLabel="Server boost progress bar in channel list"
						/>
						<Toggle
							s={s}
							set={set}
							key_="displayNameStyles"
							label="Display-name Styles"
							subLabel="Colors and effects on display names"
						/>
						<Toggle
							s={s}
							set={set}
							key_="dmActivityCards"
							label="DM Activity Cards"
							subLabel="Activity cards above direct messages"
						/>
						<Toggle
							s={s}
							set={set}
							key_="serverThemes"
							label="Server Themes"
							subLabel="Use your personal theme. Applies after restarting."
						/>
					</TableRowGroup>
					<TableRowGroup title="Nitro">
						<Toggle
							s={s}
							set={set}
							key_="questDock"
							label="Quest Dock"
							subLabel={
								serverDrawer
									? 'Disabled while Server Drawer is running'
									: 'Floating quest bar at bottom of app'
							}
							disabled={serverDrawer}
						/>
						<Toggle
							s={s}
							set={set}
							key_="youTabQuestsButton"
							label="Quests Button (YouTab bar)"
							subLabel="Quests icon on the YouTab floating bar"
						/>
						<Toggle
							s={s}
							set={set}
							key_="youTabShopButton"
							label="Shop Button (YouTab bar)"
							subLabel="Shop icon on the YouTab floating bar"
						/>
						<Toggle
							s={s}
							set={set}
							key_="youTabNitroButton"
							label="Nitro Button (YouTab bar)"
							subLabel="Nitro icon on the YouTab floating bar"
						/>
						<Toggle
							s={s}
							set={set}
							key_="youTabOrbsBalance"
							label="Orbs Balance (YouScreen)"
							subLabel="Orbs balance bar above the bio on your profile"
						/>
						<Toggle
							s={s}
							set={set}
							key_="premiumSettings"
							label="Nitro / Payment Settings (User Settings)"
							subLabel="Hides the whole Nitro/Payment settings category in User Settings"
						/>
						{!s.premiumSettings &&
							PAYMENT_OPTIONS.map(([key, label]) => (
								<Toggle key={key} s={s} set={set} key_={key} label={label} />
							))}
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}

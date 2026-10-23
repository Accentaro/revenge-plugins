import Page from '@revenge-mod/components/Page'
import { AlertActionCreators } from '@revenge-mod/discord/actions'
import { Design } from '@revenge-mod/discord/design'
import { isServerDrawerActive } from './Guildbar'
import type { PluginSettingsComponent } from '@revenge-mod/plugins/types'
import type { ComponentProps } from 'react'
import type { SurfacePreferences } from './surfacePreferences'

export interface Settings {
	customizeMessageActions: boolean
	customizeSettings: boolean
	surfaces?: Record<string, SurfacePreferences>
	improvedHeader: boolean
	collapsibleInput: boolean
	collapsibleYouBar: boolean
	improvedGuildHeader: boolean
	collapsibleGuildbar: boolean
}

export const defaults: Settings = {
	customizeMessageActions: true,
	customizeSettings: false,
	improvedHeader: true,
	collapsibleInput: true,
	collapsibleYouBar: false,
	improvedGuildHeader: false,
	collapsibleGuildbar: false,
}

export default function SettingsComponent({
	api: { jsonStorage },
}: ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>) {
	const settings = { ...defaults, ...jsonStorage.use() }
	return (
		<Page>
			<Design.TableRowGroup title="Chat">
				<Design.TableSwitchRow
					label="Tabbed channel page"
					subLabel="Open channels with Chat first, followed by the channel details tabs."
					value={settings.improvedHeader}
					onValueChange={improvedHeader => jsonStorage.set({ improvedHeader })}
				/>
				<Design.TableSwitchRow
					label="Collapsible chat input"
					subLabel="Swipe down on the chat bar or its handle to collapse it. Swipe up or tap the bottom handle to reopen it."
					value={settings.collapsibleInput}
					onValueChange={collapsibleInput =>
						jsonStorage.set({ collapsibleInput })
					}
				/>
			</Design.TableRowGroup>
			<Design.TableRowGroup title="Channel list">
				<Design.TableSwitchRow
					label="Collapsible guildbar"
					subLabel="Swipe left on the guildbar to hide it. Swipe right on the channel or messages list to restore it."
					value={settings.collapsibleGuildbar}
					onValueChange={collapsibleGuildbar => {
						if (collapsibleGuildbar && isServerDrawerActive()) {
							const key = 'accentaro.ui-tweaks.guildbar-conflict'
							AlertActionCreators.openAlert(
								key,
								<Design.AlertModal
									title="Disable Server Drawer first"
									content="Disable Server Drawer and reload Discord before using Collapsible guildbar."
									actions={
										<Design.AlertActionButton
											text="Okay"
											variant="primary"
											onPress={() => AlertActionCreators.dismissAlert(key)}
										/>
									}
								/>,
							)
							return
						}
						jsonStorage.set({ collapsibleGuildbar })
					}}
				/>
				<Design.TableSwitchRow
					label="Collapsible You bar"
					subLabel="Swipe down on the You bar to hide it. Swipe up on the chevron or server drawer to bring it back."
					value={settings.collapsibleYouBar}
					onValueChange={collapsibleYouBar =>
						jsonStorage.set({ collapsibleYouBar })
					}
				/>
				<Design.TableSwitchRow
					label="Detailed server header"
					subLabel="Show the server badges and online/member counts beneath its original banner."
					value={settings.improvedGuildHeader}
					onValueChange={improvedGuildHeader =>
						jsonStorage.set({ improvedGuildHeader })
					}
				/>
			</Design.TableRowGroup>
			<Design.TableRowGroup title="Misc">
				<Design.TableSwitchRow
					label="Customize long-press actions"
					subLabel="Hide and reorder message, DM and channel actions. Each layout is saved separately and kept when disabled."
					value={settings.customizeMessageActions}
					onValueChange={customizeMessageActions =>
						jsonStorage.set({ customizeMessageActions })
					}
				/>
				<Design.TableSwitchRow
					label="Customize settings"
					subLabel="Add an edit button to Settings to hide and reorder entries within each category. Your layout is kept when disabled."
					value={settings.customizeSettings}
					onValueChange={customizeSettings =>
						jsonStorage.set({ customizeSettings })
					}
				/>
			</Design.TableRowGroup>
		</Page>
	)
}

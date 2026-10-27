/** @jsxImportSource . */
import Page from '@revenge-mod/components/Page'
import { Design } from '@revenge-mod/discord/design'
import { ScrollView } from 'react-native'
import type { PluginSettingsComponent } from '@revenge-mod/plugins/types'
import type { ComponentProps } from 'react'
import type { ServerDrawerPreferences } from './types'

export const DefaultSettings: ServerDrawerPreferences = {
	dmOrder: [],
	layout: 'grid',
	pullToMarkRead: false,
	softDockGestures: false,
	haptics: false,
	carousel: false,
}

export default function Settings({
	api: { jsonStorage, plugin },
}: ComponentProps<
	PluginSettingsComponent<{ jsonStorage: ServerDrawerPreferences }>
>) {
	const {
		pullToMarkRead,
		softDockGestures = false,
		haptics = false,
		carousel = false,
	} = jsonStorage.use() ?? DefaultSettings
	return (
		<ScrollView style={{ flex: 1 }}>
			<Page>
				<Design.TableRowGroup title="Gestures">
					<Design.TableSwitchRow
						label="Soft dock gestures"
						subLabel="Lift the dock with gentle resistance, bounce back on short pulls, and expand on release after a longer pull. Requires reload."
						value={softDockGestures}
						onValueChange={value => {
							jsonStorage.set({ softDockGestures: value })
							plugin.requireReload()
						}}
					/>
					<Design.TableSwitchRow
						label="Carousel"
						subLabel="Swipe left or right through servers and folders in the collapsed dock, looping back around at either end."
						value={carousel}
						onValueChange={value => jsonStorage.set({ carousel: value })}
					/>
					<Design.TableSwitchRow
						label="Haptics"
						subLabel="Light feedback when opening or closing the drawer and opening a focused context menu."
						value={haptics}
						onValueChange={value => jsonStorage.set({ haptics: value })}
					/>
					<Design.TableSwitchRow
						label="Pull down to mark all as read"
						subLabel="Pull the collapsed dock down until it is flat, then release to mark all servers and DMs as read."
						value={pullToMarkRead}
						onValueChange={value => jsonStorage.set({ pullToMarkRead: value })}
					/>
				</Design.TableRowGroup>
			</Page>
		</ScrollView>
	)
}

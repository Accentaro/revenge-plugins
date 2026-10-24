import Page from '@revenge-mod/components/Page'
import { Design } from '@revenge-mod/discord/design'
import type { PluginSettingsComponent } from '@revenge-mod/plugins/types'
import type { ComponentProps } from 'react'

export interface Settings {
	showFavorites: boolean
	showSettings: boolean
}

export const defaults: Settings = {
	showFavorites: true,
	showSettings: true,
}

export default function SettingsComponent({
	api: { jsonStorage },
}: ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>) {
	const settings = { ...defaults, ...jsonStorage.use() }
	return (
		<Page>
			<Design.TableRowGroup title="You bar shortcuts">
				<Design.TableSwitchRow
					label="Favorites"
					value={settings.showFavorites}
					onValueChange={showFavorites => jsonStorage.set({ showFavorites })}
				/>
				<Design.TableSwitchRow
					label="Settings"
					value={settings.showSettings}
					onValueChange={showSettings => jsonStorage.set({ showSettings })}
				/>
			</Design.TableRowGroup>
		</Page>
	)
}

/** @jsxImportSource . */
import { Design } from '@revenge-mod/discord/design'
import { useEffect } from 'react'
import { ScrollView } from 'react-native'
import { ProviderSelect } from './picker'
import {
	configureStorage,
	GridQualities,
	loadSettings,
	useGifProvidersSettings,
} from './storage'
import type { PluginSettingsComponent } from '@revenge-mod/plugins/types'
import type { ComponentProps } from 'react'
import type {
	GridQuality,
	GifProvidersSettings as SettingsData,
} from './storage'

const labels: Record<GridQuality, { label: string; subLabel: string }> = {
	gif: { label: 'GIF', subLabel: 'Original quality, ~500px — slowest' },
	tinygif: {
		label: 'TinyGIF',
		subLabel: 'Small animated thumbnail, ~200px — default',
	},
	nanogif: { label: 'NanoGIF', subLabel: 'Tiny thumbnail, ~100px — fastest' },
}

export default function GifProvidersSettings({
	api: { jsonStorage, plugin },
}: ComponentProps<PluginSettingsComponent<{ jsonStorage: SettingsData }>>) {
	configureStorage(jsonStorage)
	jsonStorage.use()
	useEffect(() => {
		void loadSettings().catch(error => plugin.reportError(error))
	}, [plugin])
	const { gridQuality, updateSettings } = useGifProvidersSettings()

	return (
		<ScrollView style={{ flex: 1 }}>
			<Design.Stack
				style={{ paddingVertical: 24, paddingHorizontal: 12 }}
				spacing={24}
			>
				<Design.TableRowGroup title="Providers">
					<ProviderSelect />
				</Design.TableRowGroup>
				<Design.TableRadioGroup
					title="Tenor and Giphy grid quality"
					value={gridQuality}
					onChange={(value: string) => {
						const quality = GridQualities.find(quality => quality === value)
						if (quality) updateSettings({ gridQuality: quality })
					}}
				>
					{GridQualities.map(q => (
						<Design.TableRadioRow
							key={q}
							label={labels[q].label}
							subLabel={labels[q].subLabel}
							value={q}
						/>
					))}
				</Design.TableRadioGroup>
			</Design.Stack>
		</ScrollView>
	)
}

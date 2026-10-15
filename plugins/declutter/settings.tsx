/** @jsxImportSource . */
import Page from '@revenge-mod/components/Page'
import { Design } from '@revenge-mod/discord/design'
import { ScrollView } from 'react-native'
import {
	paymentOptions,
	profileOptions,
	resolveSettings,
	userAreaOptions,
} from './preferences'
import type { PluginSettingsComponent } from '@revenge-mod/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './preferences'

export default function SettingsComponent({
	api: { jsonStorage },
}: ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>) {
	const settings = resolveSettings(jsonStorage.use())
	const toggle = (key: keyof Settings, label: string, subLabel?: string) => (
		<Design.TableSwitchRow
			key={key}
			label={label}
			subLabel={subLabel}
			value={settings[key]}
			onValueChange={value => jsonStorage.set({ [key]: value })}
		/>
	)
	return (
		<ScrollView style={{ flex: 1 }}>
			<Page>
				<Design.TableRowGroup title="Servers">
					{toggle(
						'hideServerBoostGoal',
						'Hide boost goal',
						'Remove the progress bar from channel lists.',
					)}
					{toggle(
						'disableServerThemes',
						'Use personal theme',
						'Ignore server themes. Applies after restarting.',
					)}
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Direct messages">
					{toggle('hideDmActivityCards', 'Hide activity cards')}
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Hide profile cosmetics">
					{profileOptions.map(([key, label]) =>
						toggle(
							key,
							label.replace('Hide ', '').replace(/^./, c => c.toUpperCase()),
						),
					)}
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Profile content">
					{toggle('hideProfileBadges', 'Hide badges')}
					{toggle(
						'hideProfileTabs',
						'Hide extra tabs',
						'Remove Wishlist, Board and Activity from profiles.',
					)}
					{toggle(
						'hideOrbsBalance',
						'Hide Orbs balance',
						'Remove the balance widget from your profile.',
					)}
				</Design.TableRowGroup>
				<Design.TableRowGroup title="You tab and navigation">
					{userAreaOptions.map(([key, label]) =>
						toggle(key, `Hide ${label} button`),
					)}
					{toggle(
						'hideQuestDock',
						'Hide Quest Dock',
						'Remove the floating quest bar.',
					)}
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Payment settings">
					{toggle(
						'hidePaymentSettings',
						'Hide all payment settings',
						'Turn off to choose individual entries.',
					)}
					{!settings.hidePaymentSettings &&
						paymentOptions.map(([key, label]) => toggle(key, `Hide ${label}`))}
				</Design.TableRowGroup>
			</Page>
		</ScrollView>
	)
}

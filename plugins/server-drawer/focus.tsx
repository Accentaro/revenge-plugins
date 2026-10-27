import { getModules, lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { beforeJSX } from '@revenge-mod/react/jsx-runtime'
import { Children, cloneElement, isValidElement } from 'react'
import { StyleSheet } from 'react-native'
import type { ReactElement, ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import type { MenuItem } from './types'

export const focusMenus = new WeakSet<MenuItem[]>()
type BackdropProps = { blur?: string }
type DismissProps = { 'aria-hidden'?: boolean; style?: StyleProp<ViewStyle> }
type Backdrop = (props: BackdropProps) => ReactElement<{ children?: ReactNode }>

export function patchFocusMenu(
	cleanup: (...callbacks: (() => void)[]) => void,
) {
	const [context] = lookupModule(
		withProps<{
			ContextMenuStore: { getState(): { menu?: { items: MenuItem[] } } }
			hideContextMenu(): void
		}>('ContextMenuStore', 'hideContextMenu'),
	)
	cleanup(
		getModules(
			withProps<{ Backdrop: Backdrop }>('Backdrop'),
			({ Backdrop }) => {
				// Only wrap the backdrop for our focused menu. Keep Discord's hooks,
				// dismiss handlers and accessible button; don't intercept shared Pressables.
				function FocusBackdrop(props: BackdropProps) {
					const tree = Backdrop(props)
					if (!isValidElement(tree)) return tree
					return cloneElement(
						tree,
						{},
						Children.map(tree.props.children, child => {
							if (
								!isValidElement<DismissProps>(child) ||
								!child.props['aria-hidden']
							)
								return child
							const style = StyleSheet.flatten(child.props.style)
							if (
								style?.position !== 'absolute' ||
								style.top !== 0 ||
								style.bottom !== 0 ||
								style.left !== 0 ||
								style.right !== 0
							)
								return child
							return cloneElement(child, {
								style: [child.props.style, { backgroundColor: 'transparent' }],
							})
						}),
					)
				}
				cleanup(
					beforeJSX(Backdrop, ([type, props, key]) => {
						const menu = context?.ContextMenuStore.getState().menu
						return menu && focusMenus.has(menu.items) && props.blur === 'none'
							? [FocusBackdrop, props, key]
							: [type, props, key]
					}),
				)
			},
		),
	)
}

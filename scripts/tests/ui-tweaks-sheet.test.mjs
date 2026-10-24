import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { transformSync } from '@swc/core'

test('channel sheet patches can still traverse and insert permission rows', async () => {
	const jsx = (type, props, key = null) => ({ type, props, key })
	const isValidElement = value => !!value?.type && !!value?.props
	const Design = { ActionSheet() {} }
	let onOpen, onSheet
	const cleanup = []
	const modules = {
		'@revenge-mod/discord/actions': {
			ActionSheetActionCreators: { hideActionSheet() {} },
		},
		'@revenge-mod/discord/design': { Design },
		'@revenge-mod/discord/flux': {
			Stores: { ChannelStore: { getChannel: () => ({ guild_id: 'guild' }) } },
		},
		'@revenge-mod/patcher': {
			before(_object, _key, callback) {
				onOpen = callback
				return () => {}
			},
			instead(object, key, callback) {
				const original = object[key]
				object[key] = function (...args) {
					return callback.call(this, args, original)
				}
				return () => {
					object[key] = original
				}
			},
		},
		'@revenge-mod/react/jsx-runtime': {
			afterJSX(_type, callback) {
				onSheet = callback
				return () => {}
			},
		},
		react: {
			Component: class {},
			isValidElement,
			createContext: () => ({ Provider: {} }),
		},
		'react/jsx-runtime': { jsx, jsxs: jsx },
		'./SheetEditor': {},
		'./surfaces': {
			componentName: type => type.name,
			createMessageSurface: () => ({ id: 'message' }),
			createChannelSurface: id => ({ id }),
		},
	}
	const exports = {}
	const source = readFileSync(
		new URL('../../plugins/ui-tweaks/MessageSheet.tsx', import.meta.url),
		'utf8',
	)
	const { code } = transformSync(source, {
		filename: 'MessageSheet.tsx',
		jsc: {
			target: 'es2022',
			parser: { syntax: 'typescript', tsx: true },
			transform: { react: { runtime: 'automatic' } },
		},
		module: { type: 'commonjs' },
	})
	runInNewContext(code, {
		exports,
		require: name => {
			assert.ok(name in modules, `Unexpected dependency: ${name}`)
			return modules[name]
		},
	})
	exports.registerMessageSheet({
		cleanup: fn => cleanup.push(fn),
		plugin: {
			reportError: error => {
				throw error
			},
		},
	})
	const group = jsx(function ActionSheetRowGroup() {}, {
		hasIcons: true,
		children: [],
	})
	const sheet = jsx(Design.ActionSheet, {
		header: jsx(function ActionSheetIconHeader() {}, {}),
		children: [group],
	})
	const owner = {
		default: () =>
			jsx(function ConnectedChannelSheet() {
				return onSheet(sheet)
			}, {}),
	}
	const pending = Promise.resolve(owner)
	onOpen([pending, 'ChannelLongPress-test'])
	await pending
	const boundary = owner.default({ channelId: 'test' })
	assert.equal(
		typeof boundary.type,
		'function',
		'Permission Viewer hooks the returned callable component',
	)
	const rendered = boundary.type(boundary.props)
	function findRows(node) {
		if (Array.isArray(node)) {
			if (node.length && node.every(row => row?.props?.hasIcons !== undefined))
				return node
			for (const child of node) {
				const rows = findRows(child)
				if (rows) return rows
			}
		}
		return node && typeof node === 'object'
			? findRows(node.props?.children ?? node.children)
			: undefined
	}
	const rows = findRows(rendered)
	assert.equal(
		rows,
		sheet.props.children,
		'Rows remain reachable through props/children',
	)
	const permissionRow = jsx(
		group.type,
		{ hasIcons: true, children: [] },
		'permission-viewer-channel',
	)
	rows.push(permissionRow)
	assert.equal(sheet.props.children.at(-1), permissionRow)
	cleanup.reverse().forEach(fn => fn())
})

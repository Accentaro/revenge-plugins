const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const swc = require('@swc/core')

const source = fs.readFileSync('plugins/server-drawer/index.tsx', 'utf8')
const code = swc.transformSync(source, {
	jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } },
	module: { type: 'commonjs' },
}).code
let definition
const subscriptions = new Map()
let reloads = 0
let originalCalls = 0
const cleanups = []
const gates = {
	getICYMIEnabled() { originalCalls++; return true },
	useICYMIEnabled() { originalCalls++; return true },
}
const originalGet = gates.getICYMIEnabled
const originalUse = gates.useICYMIEnabled
const homeConfig = Object.freeze({ enableHome: true, landOnHome: true, enablePeekHint: true, unrelated: 'preserved' })
let homeCalls = 0
const home = {
	getConfig() { homeCalls++; return homeConfig },
	useConfig() { homeCalls++; return homeConfig },
}
const originalHomeGet = home.getConfig
const originalHomeUse = home.useConfig
const imports = {
	'@revenge-mod/discord/actions': {},
	'@revenge-mod/discord/utils/modules/finders': { getModuleWithImportedPath: () => () => {} },
	'@revenge-mod/modules/finders': { getModules: (filter, callback) => {
		subscriptions.set(filter[0], callback)
		return () => { subscriptions.delete(filter[0]) }
	} },
	'@revenge-mod/modules/finders/filters': { withProps: (...keys) => keys },
	'@revenge-mod/patcher': { after: (target, key, callback) => {
		const original = target[key]
		target[key] = function (...args) { return callback(Reflect.apply(original, this, args)) }
		return () => { target[key] = original }
	} },
	react: {}, 'react-native': {}, './data': {}, './settings': {}, './surface': {},
}
vm.runInNewContext(code, {
	exports: {}, AbortController,
	plugin: value => { definition = value; return value },
	require: name => { if (name.endsWith('/jsx-runtime')) return {}; assert.ok(name in imports, name); return imports[name] },
})
const api = { cleanup: callback => cleanups.push(callback), plugin: { startedLate: true, requireReload: () => reloads++, reportError() {} } }
definition.start(api)
assert.equal(reloads, 1)
assert.equal(subscriptions.size, 0)
assert.equal(cleanups.length, 0)
api.plugin.startedLate = false
definition.start(api)
assert.equal(subscriptions.size, 2)
subscriptions.get('getICYMIEnabled')(gates)
subscriptions.get('MobileHomeDrawerExperiment')({ MobileHomeDrawerExperiment: home })
assert.equal(gates.getICYMIEnabled(), false)
assert.equal(gates.useICYMIEnabled(), false)
assert.equal(originalCalls, 2)
for (const key of ['getConfig', 'useConfig']) {
	const config = home[key]()
	assert.equal(config.enableHome, false)
	assert.equal(config.landOnHome, false)
	assert.equal(config.enablePeekHint, false)
	assert.equal(config.unrelated, 'preserved')
	assert.notEqual(config, homeConfig)
}
assert.equal(homeCalls, 2)
assert.equal(homeConfig.enableHome, true)
definition.stop(api)
assert.equal(reloads, 2)
for (const cleanup of cleanups.reverse()) cleanup()
assert.equal(subscriptions.size, 0)
assert.equal(gates.getICYMIEnabled, originalGet)
assert.equal(gates.useICYMIEnabled, originalUse)
assert.equal(gates.getICYMIEnabled(), true)
assert.equal(home.getConfig, originalHomeGet)
assert.equal(home.useConfig, originalHomeUse)
assert.equal(home.getConfig(), homeConfig)
console.log('PASS: ICYMI and Home Drawer gates, preserved config/hooks, reload requirements and cleanup')

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
let receiveModule
let subscribed = false
let reloads = 0
let originalCalls = 0
const cleanups = []
const gates = {
	getICYMIEnabled() { originalCalls++; return true },
	useICYMIEnabled() { originalCalls++; return true },
}
const originalGet = gates.getICYMIEnabled
const originalUse = gates.useICYMIEnabled
const imports = {
	'@revenge-mod/discord/actions': {},
	'@revenge-mod/discord/utils/modules/finders': { getModuleWithImportedPath: () => () => {} },
	'@revenge-mod/modules/finders': { getModules: (filter, callback) => {
		assert.deepEqual(filter, ['getICYMIEnabled', 'useICYMIEnabled'])
		subscribed = true
		receiveModule = callback
		return () => { subscribed = false }
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
assert.equal(subscribed, false)
assert.equal(cleanups.length, 0)
api.plugin.startedLate = false
definition.start(api)
assert.equal(subscribed, true)
receiveModule(gates)
assert.equal(gates.getICYMIEnabled(), false)
assert.equal(gates.useICYMIEnabled(), false)
assert.equal(originalCalls, 2)
definition.stop(api)
assert.equal(reloads, 2)
for (const cleanup of cleanups.reverse()) cleanup()
assert.equal(subscribed, false)
assert.equal(gates.getICYMIEnabled, originalGet)
assert.equal(gates.useICYMIEnabled, originalUse)
assert.equal(gates.getICYMIEnabled(), true)
console.log('PASS: ICYMI gates, original hook execution, late-start reload, stop reload and cleanup')

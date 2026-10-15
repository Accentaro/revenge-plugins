import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { zipSync } from 'fflate'

function run(args) {
	const result = spawnSync(process.execPath, args, {
		stdio: 'inherit',
		windowsHide: true,
	})
	if (result.error) throw result.error
	if (result.status !== 0) process.exit(result.status ?? 1)
}
run(['node_modules/typescript/bin/tsc', '--noEmit'])
run(['node_modules/@revenge-mod/plugin-cli/bin/revenge-plugin.js', 'build'])
mkdirSync('build/dist', { recursive: true })
for (const folder of readdirSync('plugins', { withFileTypes: true })) {
	if (!folder.isDirectory()) continue
	const base = `plugins/${folder.name}/`
	const manifest = readFileSync(`${base}manifest.json`)
	const { id, version, dist } = JSON.parse(manifest)
	if (!dist?.script)
		throw new Error(`${folder.name}: missing script distribution`)
	const bundle = `${base}build/js/index.js`
	run([
		'node_modules/@biomejs/biome/bin/biome',
		'lint',
		'--vcs-enabled=false',
		'--only=correctness/noUndeclaredVariables',
		bundle,
	])
	const files = {
		'manifest.json': manifest,
		[dist.script]: readFileSync(bundle),
	}
	if (dist.android)
		files[dist.android.path] = readFileSync(
			`${base}build/outputs/plugin/plugin.jar`,
		)
	files.LICENSE = readFileSync('LICENSE')
	files['LICENSE.rain'] = readFileSync('LICENSE.rain')
	writeFileSync(`build/dist/${id}@${version}.zip`, zipSync(files))
	console.log(`Packaged ${id}@${version}`)
}

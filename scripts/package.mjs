import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { zipSync } from "fflate";
function run(args) {
    const result = spawnSync(process.execPath, args, { stdio: "inherit", windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}
run(["node_modules/typescript/bin/tsc", "--noEmit"]);
run(["node_modules/@revenge-mod/plugin-cli/bin/revenge-plugin.js", "build"]);
mkdirSync("build/dist", { recursive: true });
for (const folder of readdirSync("plugins", { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const base = `plugins/${folder.name}/`;
    const manifest = readFileSync(`${base}manifest.json`);
    const { id, version, dist } = JSON.parse(manifest);
    if (dist?.android || !dist?.script) throw new Error(`${folder.name}: packaging requires a JavaScript-only plugin`);
    const bundle = `${base}build/js/index.js`;
    run(["node_modules/@biomejs/biome/bin/biome", "lint", "--vcs-enabled=false", "--only=correctness/noUndeclaredVariables", bundle]);
    writeFileSync(`build/dist/${id}@${version}.zip`, zipSync({ "manifest.json": manifest, [dist.script]: readFileSync(bundle) }));
    console.log(`Packaged ${id}@${version}`);
}

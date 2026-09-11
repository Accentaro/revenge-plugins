import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { zipSync } from "fflate";
function run(args) {
    const result = spawnSync(process.execPath, args, { stdio: "inherit", windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}
run(["node_modules/typescript/bin/tsc", "--noEmit"]);
run(["node_modules/@revenge-mod/plugin-cli/bin/revenge-plugin.js", "build", "serverdrawer"]);
run(["node_modules/@biomejs/biome/bin/biome", "lint", "--vcs-enabled=false", "--only=correctness/noUndeclaredVariables", "plugins/serverdrawer/build/js/index.js"]);
const base = "plugins/serverdrawer/";
const manifest = readFileSync(`${base}manifest.json`);
const { id, version } = JSON.parse(manifest);
mkdirSync("build/dist", { recursive: true });
writeFileSync(`build/dist/${id}.zip`, zipSync({ "manifest.json": manifest, "index.js": readFileSync(`${base}build/js/index.js`) }));
console.log(`Packaged ${id}@${version}`);

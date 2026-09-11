import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
function run(executable, args) {
    const result = spawnSync(executable, args, { stdio: "inherit", windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${executable} failed (${result.status})`);
}
const types = "node_modules/@revenge-mod/types";
const ref = JSON.parse(readFileSync("package.json", "utf8")).dependencies["@revenge-mod/types"].split("#")[1];
if (!/^[a-f0-9]{40}$/.test(ref)) throw new Error("Pin the Revenge type definitions to a commit");
mkdirSync(".toolchain", { recursive: true });
// The upstream npm package omits its declarations. Restore the exact pinned Git source.
if (!existsSync(`${types}/index.d.ts`)) {
    const checkout = ".toolchain/revenge-types";
    if (!existsSync(`${checkout}/.git`)) run("git", ["clone", "--no-checkout", "--filter=blob:none", "https://github.com/revenge-mod/revenge-types.git", checkout]);
    run("git", ["-C", checkout, "fetch", "--depth=1", "origin", ref]);
    run("git", ["-C", checkout, "checkout", "--detach", ref]);
    for (const entry of readdirSync(checkout)) {
        if (entry.endsWith(".d.ts") || entry === "lib") cpSync(`${checkout}/${entry}`, `${types}/${entry}`, { recursive: true });
    }
}
// Build the official CLI after its peer type maps are present; npm prepares Git dependencies too early.
const cli = resolve("node_modules/@revenge-mod/plugin-cli");
const config = {
    compilerOptions: {
        target: "esnext", module: "nodenext", moduleResolution: "nodenext", strict: true, skipLibCheck: true,
        allowImportingTsExtensions: true, rewriteRelativeImportExtensions: true, verbatimModuleSyntax: true,
        resolveJsonModule: true, types: ["node"], typeRoots: [resolve("node_modules/@types")],
        rootDir: `${cli}/src`, outDir: `${cli}/dist`,
    },
    include: [`${cli}/src`],
};
writeFileSync(".toolchain/cli.tsconfig.json", JSON.stringify(config, null, 4));
run(process.execPath, ["node_modules/typescript/bin/tsc", "-p", ".toolchain/cli.tsconfig.json"]);

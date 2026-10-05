import { transformSync } from "@babel/core";
import { transformSync as downlevel } from "@swc/core";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const result = spawnSync(process.execPath, ["node_modules/@revenge-mod/plugin-cli/bin/revenge-plugin.js", "build", ...process.argv.slice(2)], {
    stdio: "inherit", windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

// Discord supplies Reanimated; compile the plugin's explicit worklets for its 3.x runtime.
process.env.BABEL_ENV = "production";
const bundle = "plugins/serverdrawer/build/js/index.js";
const compiled = transformSync(readFileSync(bundle, "utf8"), {
    filename: bundle, babelrc: false, configFile: false, compact: true,
    plugins: ["rain-worklet-compiler/plugin"],
});
if (!compiled?.code) throw new Error("ServerDrawer worklet compilation produced no code");
writeFileSync(bundle, downlevel(compiled.code, {
    jsc: { target: "es5" }, minify: true,
}).code);

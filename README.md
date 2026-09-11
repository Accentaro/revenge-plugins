# Benjii's ports for revenge next
Plugins ported to Revenge Next. Credit goes to the original plugin developers.

## How to install
Copy the repository URL below into **Settings → Plugins → Advanced → Add repository**. Open **Browse Plugins**, install the plugin, enable it, and restart Discord.

Requires **Revenge Next**; these plugins do not support Revenge Classic, Bunny, or Vendetta.

> https://accentaro.github.io/revenge-plugins/

## Plugins

### ServerDrawer
A compact server dock with a searchable server and DM drawer, grid/list layouts, folders, drag and drop, unread indicators, and native server menus.
By **kmmiio99o, Rosie, and Benjii**.

<details>
<summary>Development</summary>

Use Node.js 24 and Git:

```sh
npm ci --ignore-scripts --legacy-peer-deps
npm run prepare:tools
npm run lint
npm run package
```

Plugin sources live in `plugins/<name>/js/` with a Next manifest alongside them. ZIPs are written to `build/dist/<id>@<version>.zip`.

Bump the manifest version and push to `main` to release. GitHub Actions validates and publishes immutable ZIPs and the Next index to `gh-pages`, then deploys that repository to Pages. Next verifies artifact SHA-256 hashes.

The pinned upstream type package omits declarations, and npm prepares the Git CLI before its peer types exist. `prepare:tools` restores those declarations and compiles the official CLI.

For local testing, run `npm run serve -- --port 8767 --host 127.0.0.1 --base-url http://127.0.0.1:8767`, use `adb reverse tcp:8767 tcp:8767`, and add `http://127.0.0.1:8767` in Revenge.

The `runtime/` directory retains the pinned Next bundle used by the existing device installation; see its [provenance](runtime/README.md).

</details>

## Credits and licenses
ServerDrawer was ported from [Rain](https://codeberg.org/raincord/rain), base commit `ccedb6fb2bfe21227abe7414eb970aa4d2190b4f`. Rain-derived sources retain [MPL-2.0](LICENSE.rain). The [official Next template](https://github.com/revenge-mod/revenge-plugin-template) scaffolding retains [GPL-3.0](LICENSE).

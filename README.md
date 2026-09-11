# Rain plugins for Revenge Next
ServerDrawer brings Rain's compact server dock and searchable server/DM drawer to Revenge Next.
## Install
In Revenge Next, open **Settings → Plugins → Advanced**, then add this repository URL:
`https://raw.githubusercontent.com/Accentaro/revenge-plugins/gh-pages`
Return to **Browse Plugins**, install **ServerDrawer**, enable it, and restart Discord.
The index and versioned ZIPs use the official Revenge plugin repository format, including SHA-256 verification. No GitHub Pages setup is required.
## ServerDrawer
- Compact server dock and searchable server/DM drawer.
- Grid and list layouts, saved between restarts.
- Native server menus, unread indicators, and mentions.
- Folder management and drag and drop; folder changes sync through Discord's native account settings.
- Disabling restores the native rail and removes listeners and patches.
Test target: Discord **344.13**, Revenge Next **0.1.0-ac8c590-main**, RevengeXposed **1.6.3**. The manifest limits installation to the tested Discord version range. Revenge Classic is not supported.
## Development
Use Node.js 24 and Git:
```sh
npm ci --ignore-scripts --legacy-peer-deps
npm run prepare:tools
npm run lint
npm test
npm run package
npm run serve -- --port 8767 --host 127.0.0.1 --base-url http://127.0.0.1:8767
adb reverse tcp:8767 tcp:8767
```
Add `http://127.0.0.1:8767` in Revenge for local testing. Build output: `build/dist/dev.rain.serverdrawer.zip`.
The pinned upstream type package omits declarations, and npm prepares the Git CLI dependency before its peer type maps exist. `prepare:tools` restores the exact pinned declarations and compiles the unmodified official CLI. Packaging checks types and generated references before creating the ZIP.
Bump the plugin manifest version and push to `main` to publish. The template's release workflow keeps versioned artifacts and an index on `gh-pages`, served directly by GitHub.
## Credits and licenses
ServerDrawer: kmmiio99o, Rosie, and Benjii. Ported from the local Rain ServerDrawer sources associated with [raincord/rain](https://codeberg.org/raincord/rain), base commit `ccedb6fb2bfe21227abe7414eb970aa4d2190b4f`.
Rain-derived plugin sources retain the MPL-2.0 license in [LICENSE.rain](LICENSE.rain). The original [Revenge plugin template](https://github.com/revenge-mod/revenge-plugin-template) scaffolding retains its GPL-3.0 license in [LICENSE](LICENSE).

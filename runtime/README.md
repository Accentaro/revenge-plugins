# Pinned Revenge Next runtime

Production build from local Revenge Next source at [e4d0712dafb5f71588b9971ad38f69e975043ae9](https://github.com/revenge-mod/revenge-bundle-next/tree/e4d0712dafb5f71588b9971ad38f69e975043ae9).
Includes the local plugin reload fixes: preserve pending reload flags and mark late starts after native restart completes.
The build script also supports an optional development marker. This production bundle does not set it.

SHA-256: `0db0e37c92074164302d6016f652d45976fdb1799561cc2cb5d3bf9ac1ed1cdc`.
License: [GPL-3.0](../LICENSE). Corresponding source: [source.zip](source.zip).

To rebuild, extract the source and run `deno install --frozen`, then `deno run build` in a Git checkout at that commit with these environment variables:

```text
NODE_ENV=production
REVENGE_DISCORD_SERVER_URL=https://discord.com/invite/ddcQf3s2Uq
REVENGE_SOURCE_REPOSITORY_URL=https://github.com/Accentaro/revenge-plugins/tree/main/runtime
REVENGE_LICENSE_URL=https://github.com/revenge-mod/revenge-bundle-next/blob/e4d0712/LICENSE
```

The bundle remains available at its existing raw GitHub URL. Installing a plugin does not change the loader configuration.

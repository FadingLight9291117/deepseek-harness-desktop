# dsh desktop

English | [中文](README.zh.md)

Electron desktop shell over the full dsh web UI. The main process boots the shared `desktop` profile from the same `DSH_HOME` and profile layers as the CLI, while its desktop bundle removes the HTTP server and browser transport rows. The renderer loads through the local `dsh://app` protocol; unary API calls use that protocol and live host/session streams cross the sandboxed preload bridge over IPC push channels. The app opens no HTTP port (see the [desktop-shell decision](../../.agents/notes/implemented/architecture/2026-08-14-desktop-shell-tech-selection.md) and the [GUI layering note](../../.agents/notes/implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol.md)).

The main process also supplies native path opening and directory selection through Electron's cross-platform `shell.openPath` and `dialog.showOpenDialog` APIs. Cordis receives platform-neutral closures, and selected paths pass through unchanged, so the same integration accepts macOS paths, Windows drive paths, and UNC paths without platform branches in the provider.

## Build and run

```sh
pnpm run build                                          # full repo build: profile rows resolve to built lib bundles
pnpm --filter @deepseek-ai/dsh-desktop run build        # vite (dist/) + tsdown (lib/index.js)
pnpm --filter @deepseek-ai/dsh-desktop exec electron . --patch ./local.patch.yml
node apps/desktop/lib/index.js --headless-boot --patch ./local.patch.yml
```

`--patch <file>` is repeatable and applies overlays in command-line order before profile arguments. The headless form is the CI smoke: built `lib/index.js` runs under plain Node (Electron absent), boots the same zero-port `desktop` profile as window mode, prints `dsh desktop: host ready`, and disposes on SIGTERM.

**Manifest contract:** `healProfilesModuleFallback` links profile-mounted plugin rows into `$DSH_HOME/profiles/node_modules` from this app's own dependency closure (its BFS resolves only first-level manifest entries in the workspace), so `package.json` dependencies must list every package a mounted bundle row names — the union of the `dsh-base` and `dsh-web-app` bundle dependency rosters plus every package the shipped agent presets name. A row added to a bundle patch or a shipped preset joins this list in the same change.

## Packaging

```sh
pnpm run package:desktop -- --install     # package + install to ~/Applications
pnpm run package:desktop                  # package only; zip lands in .artifacts/desktop/
pnpm run package:desktop -- --skip-build  # reuse already-built workspace libs
```

The pipeline stages the production closure with `pnpm deploy`, packages it with `@electron/packager` (asar off — the loader and the `/plugins` route read real files), ad-hoc signs, boots the bundle headless as its own verification, and writes `dsh-desktop-darwin-<arch>.zip`. The route and its traps are recorded in the [packaging toolchain note](../../.agents/notes/implemented/process/2026-08-15-desktop-packaging-toolchain.md). The first run downloads the Electron dist zip — set `ELECTRON_MIRROR` where github.com is unreachable. A zip downloaded through a browser carries the quarantine attribute; clear it with `xattr -dr com.apple.quarantine dsh-desktop.app`. CI builds the same artifact per PR label `build-desktop` (`.github/workflows/package-desktop.yml`).

## Known Limitations and Deferred Work

- Live profile-patch hot-reload is unavailable (the HMR service needs loader internals only `--expose-internals` exposes); restart the app to apply profile edits.
- The event streams ride IPC push channels because Electron buffers protocol responses and cannot carry an unbounded SSE body through `dsh://`; the [carrier README](../../packages/client/connection-ipc/README.md) defines termination and reconnect behavior.
- macOS only for v1 distribution and GUI CI; the native adapters themselves use cross-platform Electron APIs and preserve Windows paths unchanged.
- Electron cannot programmatically close an already-visible directory panel on caller abort; the request settles and discards the eventual selection, while the panel remains until dismissal or parent-window closure.
- No tray, system notifications, auto-update, or installers (v1 scope).
- The packaged app ships the default Electron icon and the workspace's node-pty build (dev parity, no Electron-ABI rebuild); icon assets, Developer ID signing, and notarization are deferred.

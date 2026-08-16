# `@deepseek-ai/dsh-desktop-app`

English | [中文](README.zh.md)

The dsh desktop-surface bundle. [`cordis.patch.yml`](cordis.patch.yml) rides over [`dsh-web-app`](../web-app/README.md): it disables the HTTP transport rows (`webserver`, `web-runtime`, `client-hmr`, `connection`) and inserts the desktop glue — this package's `desktop-runtime` plugin, the [`dsh-client-connection-ipc`](../../client/connection-ipc/README.md) protocol carrier, the [Electron directory provider](../../host/directory-picker-electron/README.md), and its transport-independent native client flow. The plugin republishes the app's assembly facts (the built renderer dist root, provided by the app as `ctx.desktopApp`) as the `desktopRuntime` service the carrier consumes, and registers the harness-source and desktop-surface prompt sections. It also syncs the app's theme preference (`ui-theme.preference`) to the native window color scheme through the optional `desktopThemeSync` service the app provides under Electron. There is no URL line and no port: the whole client faces the `dsh://app` protocol authority.

## Model Experience

### Harness-source and Desktop-surface context

#### What the model sees

The `harness:source` section identifies the on-disk Harness implementation without claiming it is the working directory, and the `app:desktop-surface` global section (order −98) orients the model to the desktop app: the "this window" referent, the shared harness home across CLI/web/desktop surfaces, and the instruction that this surface has no web server, no URL, and must not have one started. No bash runtime variable is registered (the web surface's `DSH_WEB_URL` would be false here).

#### Token effect

One source line and one prompt paragraph per session; constant per process.

#### KV Cache effect

The surface section is a fixed global section; identical text across sessions, so the KV cache keeps it warm.

## Known Limitations and Deferred Work

- The desktop-surface orientation replaces, not complements, the web-surface text — a session created through the web profile never sees both.
- The desktop carrier's own limitations (protocol streaming, body buffering, no trust fence) live in its [README](../../client/connection-ipc/README.md).
- The native theme sync is desktop-surface-only: without the `desktopThemeSync` service (the headless boot provides none), the plugin skips the sync and still serves `desktopRuntime`.

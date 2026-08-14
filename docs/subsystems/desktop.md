# Desktop Surface

English | [中文](desktop.zh.md)

The Electron desktop shell (`apps/desktop`, `@deepseek-ai/dsh-desktop`): a window running the shipped web UI over the zero-port `dsh://` protocol carrier, sharing the CLI's profiles and harness home. The app boots the `desktop` profile (base + web-app + desktop-app bundle layers, see [`dsh-desktop-app`](../../packages/bundle/desktop-app/README.md)); the desktop-app layer disables the HTTP transport rows and the [`dsh-client-connection-ipc`](../../packages/client/connection-ipc/README.md) carrier serves the whole client — the boot-manifest-injected index, plugin bundles, vite assets, and `/api` (the in-process `toFetchHandler` gateway) — from one protocol authority. Unbounded event streams ride IPC push channels through a sandboxed preload bridge, because Electron buffers protocol responses. Open-path operations and directory selection use the ordinary host providers behind their capability services. The stack choice is recorded in the [desktop shell Agent Note](../../.agents/notes/implemented/architecture/2026-08-14-desktop-shell-tech-selection.md).

## Services

The app provides `desktopApp` (assembly facts: the built renderer dist root) at boot; the desktop-app bundle republishes them as `desktopRuntime` for the carrier rows.

## Zero-port posture

No HTTP server mounts in the desktop composition: the webserver, web-runtime, client-hmr, and connection rows are disabled by the desktop-app layer, the directory picker is pinned to the `-native` backend, and the window loads `dsh://app/index.html`. The plain-Node built-bin smoke asserts the web URL line never prints.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdesktopapp--desktopappfacts"></a>

### `ctx.desktopApp` — `DesktopAppFacts`

Assembly facts the app owns: where the built renderer lives.

Source: [`packages/bundle/desktop-app/src/index.ts:31`](../../packages/bundle/desktop-app/src/index.ts)

<a id="ctxdesktopruntime--desktopruntime"></a>

### `ctx.desktopRuntime` — `DesktopRuntime`

Runtime values the desktop carrier and surface rows consume.

Source: [`packages/bundle/desktop-app/src/index.ts:37`](../../packages/bundle/desktop-app/src/index.ts)
<!-- END GENERATED cordis-surface -->

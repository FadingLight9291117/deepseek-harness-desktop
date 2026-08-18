# Desktop Surface

English | [中文](desktop.zh.md)

The Electron desktop shell (`apps/desktop`, `@deepseek-ai/dsh-desktop`): a window running the shipped web UI over the zero-port `dsh://` protocol carrier, sharing the CLI's profiles and harness home. The app boots the `desktop` profile (base + web-app + desktop-app bundle layers, see [`dsh-desktop-app`](../../packages/bundle/desktop-app/README.md)); the desktop-app layer disables the HTTP transport rows and the [`dsh-client-connection-ipc`](../../packages/client/connection-ipc/README.md) carrier serves the whole client — the boot-manifest-injected index, plugin bundles, vite assets, and `/api` (the connection RPC channels — typert remotes — over the in-process `toFetchHandler` gateway fallback) — from one protocol authority. Unbounded event streams ride IPC push channels through a sandboxed preload bridge, because Electron buffers protocol responses. Open-path operations and directory selection use the existing native host providers behind their capability services; Electron-specific providers can replace them without changing consumers. Distribution is a packaged macOS `.app` in a zip (`pnpm run package:desktop`), ad-hoc signed and smoke-tested headless by the pipeline itself; the route is recorded in the [packaging toolchain note](../../.agents/notes/implemented/process/2026-08-15-desktop-packaging-toolchain.md), and CI builds the artifact per PR label `build-desktop`. The stack choice is recorded in the [desktop shell Agent Note](../../.agents/notes/implemented/architecture/2026-08-14-desktop-shell-tech-selection.md).

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

Source: [`packages/bundle/desktop-app/src/index.ts:39`](../../packages/bundle/desktop-app/src/index.ts)

<a id="ctxdesktopruntime--desktopruntime"></a>

### `ctx.desktopRuntime` — `DesktopRuntime`

Runtime values the desktop carrier and surface rows consume.

Source: [`packages/bundle/desktop-app/src/index.ts:45`](../../packages/bundle/desktop-app/src/index.ts)

<a id="ctxdesktopthemesync--desktopthemesync"></a>

### `ctx.desktopThemeSync` — `DesktopThemeSync`

Native window color-scheme sync the desktop app provides under Electron. The theme preference arrives schema-validated from the settings service; 'system' keeps the OS's own appearance tracking intact.

```ts cordis-catalog
/**
 * Apply the app's theme preference to the native window chrome.
 * @param preference - the persisted Light/Dark/System preference.
 */
setThemePreference(preference: ThemePreference): void
```

Source: [`packages/bundle/desktop-app/src/index.ts:55`](../../packages/bundle/desktop-app/src/index.ts)

<a id="ctxelectrondirectorypickerruntime--electrondirectorypickerruntime"></a>

### `ctx.electronDirectoryPickerRuntime` — `ElectronDirectoryPickerRuntime`

Application-owned Electron directory dialog available to the host tree.

```ts cordis-catalog
/**
 * Open one Electron directory dialog.
 * @param signal - caller/connection lifetime.
 * @returns the selected absolute path unchanged, or null when cancelled.
 */
pickDirectory(signal: AbortSignal): Promise<string | null>
```

Source: [`packages/host/directory-picker-electron/src/index.ts:15`](../../packages/host/directory-picker-electron/src/index.ts)

<a id="ctxnativepathruntime--nativepathruntime"></a>

### `ctx.nativePathRuntime` — `NativePathRuntime`

Native path operations supplied by an application-owned desktop runtime.

```ts cordis-catalog
/**
 * Hand a filesystem path to the operating system's associated application.
 * @param path - Host-resolved path; implementations must not reinterpret it.
 * @param signal - Caller lifetime.
 * @returns when the operating-system handoff has completed.
 */
openPath(path: string, signal: AbortSignal): Promise<void>

/**
 * Hand a text document to the desktop's associated editor.
 * @param path - Host-resolved document path; implementations must not reinterpret it.
 * @param signal - Caller lifetime.
 * @returns when the operating-system handoff has completed.
 */
openTextFile(path: string, signal: AbortSignal): Promise<void>

/** Reports the desktop-handoff capability this runtime provides.
 * @returns whether this runtime can hand paths to a user-visible desktop. */
canOpenPath(): boolean
```

Source: [`packages/host/apiproxy/src/index.ts:43`](../../packages/host/apiproxy/src/index.ts)
<!-- END GENERATED cordis-surface -->

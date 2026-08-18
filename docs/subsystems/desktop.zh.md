# Desktop Surface

[English](desktop.md) | 中文

Electron 桌面壳（`apps/desktop`，`@deepseek-ai/dsh-desktop`）：一个窗口，通过零端口 `dsh://` 协议载体运行线上 web UI，与 CLI 共享 profile 与 harness home。应用启动 `desktop` profile（base + web-app + desktop-app 三层 bundle，见 [`dsh-desktop-app`](../../packages/bundle/desktop-app/README.md)）；desktop-app 层禁用 HTTP 传输行，[`dsh-client-connection-ipc`](../../packages/client/connection-ipc/README.md) 载体从单一协议 authority 服务整个客户端——注入 boot 清单的 index、插件 bundle、vite 资源与 `/api`（connection RPC 通道——typert 远程端点——叠加进程内 `toFetchHandler` 网关兜底）。无界事件流经沙箱 preload 桥走 IPC 推送通道，因为 Electron 会缓冲协议响应。打开路径操作与目录选择使用能力服务之后的现有原生宿主提供方；Electron 专用提供方可以在不修改消费方的情况下替换它们。发行形态是 zip 打包的 macOS `.app`（`pnpm run package:desktop`），ad-hoc 签名、由管线自身 headless 冒烟验证；路线记录在[打包工具链 note](../../.agents/notes/implemented/process/2026-08-15-desktop-packaging-toolchain.md)，CI 按 PR 标签 `build-desktop` 构建该产物。技术栈选择记录在 [desktop shell Agent Note](../../.agents/notes/implemented/architecture/2026-08-14-desktop-shell-tech-selection.md) 中。

## Services

应用在 boot 时提供 `desktopApp`（装配事实：构建后的 renderer dist 根目录）；desktop-app bundle 将其重发布为 `desktopRuntime` 供载体行消费。

## Zero-port posture

桌面组合不挂载任何 HTTP 服务：webserver、web-runtime、client-hmr 与 connection 行由 desktop-app 层禁用，目录选择器固定为 `-native` 后端，窗口加载 `dsh://app/index.html`。plain-Node built-bin 冒烟断言 web URL 行从不打印。

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

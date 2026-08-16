# dsh desktop

[English](README.md) | 中文

dsh 完整 Web UI 的 Electron 桌面壳。main 进程从 CLI 共用的 `DSH_HOME` 与 profile 层启动 `desktop` profile，桌面 bundle 则移除 HTTP 服务器与浏览器传输行。renderer 通过本地 `dsh://app` 协议加载；unary API 调用使用该协议，实时 host/session 流经沙箱 preload 桥以 IPC 推送通道传递。应用不打开 HTTP 端口（见[桌面壳决策](../../.agents/notes/implemented/architecture/2026-08-14-desktop-shell-tech-selection.md)与 [GUI 分层笔记](../../.agents/notes/implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol.md)）。

main 进程还通过 Electron 的跨平台 `shell.openPath` 与 `dialog.showOpenDialog` API 提供原生路径打开和目录选择。Cordis 接收与平台无关的闭包，所选路径保持原样传递，因此同一套集成无需在 provider 内设置平台分支，即可接受 macOS 路径、Windows 驱动器路径与 UNC 路径。

窗口的原生标题栏跟随应用的外观设置（浅色/深色/系统，持久化在 harness settings 文档的 `ui-theme.preference`）：桌面 bundle 把偏好应用到 Electron 的 `nativeTheme.themeSource`，`system` 保持 OS 自身的外观跟踪。接线与其反馈环原理见[主题同步 note](../../.agents/notes/implemented/architecture/2026-08-16-desktop-title-bar-theme-sync.md)。

## 构建与运行

```sh
pnpm run build                                          # full repo build: profile rows resolve to built lib bundles
pnpm --filter @deepseek-ai/dsh-desktop run build        # vite (dist/) + tsdown (lib/index.js)
pnpm --filter @deepseek-ai/dsh-desktop exec electron . --patch ./local.patch.yml
node apps/desktop/lib/index.js --headless-boot --patch ./local.patch.yml
```

`--patch <file>` 可重复使用，并在 profile 参数之前按命令行顺序应用 overlay。无窗口形态是 CI 冒烟：构建后的 `lib/index.js` 在 plain Node 下运行（无 Electron），启动与窗口模式相同的零端口 `desktop` profile，打印 `dsh desktop: host ready`，SIGTERM 时清理退出。

**清单契约：** `healProfilesModuleFallback` 从本应用自身的依赖闭包把 profile 挂载的插件行链接进 `$DSH_HOME/profiles/node_modules`（其 BFS 在 workspace 内只解析清单一级条目），因此 `package.json` dependencies 必须列出每个被挂载 bundle 行指名的包——即 `dsh-base` 与 `dsh-web-app` 两个 bundle 依赖名册的并集，再加上 shipped agent preset 指名的每一个包。任一 bundle 补丁或 shipped preset 新增行时，名单在同一变更中同步更新。

## 打包

```sh
pnpm run package:desktop -- --install     # package + install to ~/Applications
pnpm run package:desktop                  # package only; zip lands in .artifacts/desktop/
pnpm run package:desktop -- --skip-build  # reuse already-built workspace libs
```

管线用 `pnpm deploy` staging 生产闭包，用 `@electron/packager` 打包（关闭 asar——Loader 与 `/plugins` 路由读真实文件），ad-hoc 签名，以 headless 启动 bundle 作为自身验证，写出 `DeepSeek-darwin-<arch>.zip`。路线与其陷阱记录在[打包工具链 note](../../.agents/notes/implemented/process/2026-08-15-desktop-packaging-toolchain.md)。首次运行下载 Electron dist zip——github.com 不可达时设 `ELECTRON_MIRROR`。浏览器下载的 zip 带 quarantine 属性；用 `xattr -dr com.apple.quarantine DeepSeek.app` 清除。CI 按 PR 标签 `build-desktop` 构建同一产物（`.github/workflows/package-desktop.yml`）。

## Known Limitations and Deferred Work

- profile 补丁热重载不可用（HMR 服务需要只有 `--expose-internals` 能暴露的 loader internals）；重启应用以应用 profile 编辑。
- 事件流走 IPC 推送通道，因为 Electron 会缓冲协议响应、无法通过 `dsh://` 承载无界 SSE body；终止与重连行为见[载体 README](../../packages/client/connection-ipc/README.md)。
- v1 发行与 GUI CI 仅支持 macOS；原生适配器本身使用跨平台 Electron API，并保持 Windows 路径不变。
- Electron 无法在调用方中止时以编程方式关闭已显示的目录面板；请求会结算并丢弃最终选择，而面板会保留到用户关闭或父窗口关闭。
- 无托盘、系统通知、自动更新与安装器（v1 范围）。
- `nativeTheme.themeSource` 是进程级的；v1 单窗口外壳不受影响，但未来的多窗口表面需决定逐窗口主题如何映射到它。
- 应用 bundle 名为 DeepSeek，图标以 `apps/desktop/build/icon.icns` 提交（favicon 变更时重新生成）；窗口标题仍是 web UI 自己的。workspace 中的 node-pty 构建原样随包（与 dev 行为一致，无 Electron-ABI rebuild）；Developer ID 签名与公证留待后续。

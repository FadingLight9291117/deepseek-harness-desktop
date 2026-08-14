# dsh desktop

[English](README.md) | 中文

dsh 完整 Web UI 的 Electron 桌面壳。main 进程从 CLI 共用的 `DSH_HOME` 与 profile 层启动 `desktop` profile，桌面 bundle 则移除 HTTP 服务器与浏览器传输行。renderer 通过本地 `dsh://app` 协议加载；unary API 调用使用该协议，实时 host/session 流经沙箱 preload 桥以 IPC 推送通道传递。应用不打开 HTTP 端口（见[桌面壳决策](../../.agents/notes/implemented/architecture/2026-08-14-desktop-shell-tech-selection.md)与 [GUI 分层笔记](../../.agents/notes/implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol.md)）。


## 构建与运行

```sh
pnpm run build                                          # full repo build: profile rows resolve to built lib bundles
pnpm --filter @deepseek-ai/dsh-desktop run build        # vite (dist/) + tsdown (lib/index.js)
pnpm --filter @deepseek-ai/dsh-desktop exec electron . --patch ./local.patch.yml
node apps/desktop/lib/index.js --headless-boot --patch ./local.patch.yml
```

`--patch <file>` 可重复使用，并在 profile 参数之前按命令行顺序应用 overlay。无窗口形态是 CI 冒烟：构建后的 `lib/index.js` 在 plain Node 下运行（无 Electron），启动与窗口模式相同的零端口 `desktop` profile，打印 `dsh desktop: host ready`，SIGTERM 时清理退出。

**清单契约：** `healProfilesModuleFallback` 从本应用自身的依赖闭包把 profile 挂载的插件行链接进 `$DSH_HOME/profiles/node_modules`（其 BFS 在 workspace 内只解析清单一级条目），因此 `package.json` dependencies 必须列出每个被挂载 bundle 行指名的包——即 `dsh-base` 与 `dsh-web-app` 两个 bundle 依赖名册的并集，再加上 shipped agent preset 指名的每一个包。任一 bundle 补丁或 shipped preset 新增行时，名单在同一变更中同步更新。

## Known Limitations and Deferred Work

- profile 补丁热重载不可用（HMR 服务需要只有 `--expose-internals` 能暴露的 loader internals）；重启应用以应用 profile 编辑。
- 事件流走 IPC 推送通道，因为 Electron 会缓冲协议响应、无法通过 `dsh://` 承载无界 SSE body；终止与重连行为见[载体 README](../../packages/client/connection-ipc/README.md)。
- v1 发行与 GUI CI 仅支持 macOS。
- 无托盘、系统通知、自动更新与安装器（v1 范围）。

# Agent Note: Desktop shell tech selection: Electron vs Tauri

Status: implemented

[English](2026-08-14-desktop-shell-tech-selection.md) | 中文

## 问题

DeepSeek Harness 需要一个桌面壳：运行共享 Web UI，在不监听 HTTP 端口的前提下承载 Node ESM 与 Cordis 运行时，并能深化打开路径、选择目录等原生能力。桌面壳必须保持 [GUI 分层决策](../../implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol.md)定义的包级分层，不能另建一套客户端实现。初始分发范围仅含 macOS，不含托盘集成、系统通知、自动更新或安装器。

## 决策

桌面壳使用 Electron。`apps/desktop` 负责应用生命周期，并从与 CLI 相同的 harness home 启动共享 `desktop` profile。`desktop-app` bundle 叠加在 `web-app` 上，禁用 HTTP 传输行并挂载 IPC 载体。renderer 通过 `dsh://app` 获得完整共享客户端：静态资源、注入的启动清单、客户端插件 bundle 与 unary `/api` 调用使用本地协议；无界 host/session 流则使用 preload 中介的 IPC 推送通道，因为 Electron 会缓冲自定义协议响应。

Electron 让宿主保留在单一 Node 进程中，因此 Cordis 服务、内存 store、NAPI 依赖与原生能力提供方都不需要 sidecar 协议。其 Chromium renderer 也与现有 Playwright 浏览器 lane 使用同一引擎。Tauri 不能用 Rust core 加载仓库的 Node 原生依赖，仍需把 Node 宿主保留为 sidecar；它无法替代 Node 运行时，却会增加进程边界、Rust 工具链与 WKWebView 覆盖。

renderer 启用 sandbox 与 context isolation。preload 只暴露 IPC 载体所需的流订阅方法；载体包本身不 import Electron。与传输无关的连接状态、RPC handle 与重连行为保留在 `dsh-client-connection-core`，由浏览器与桌面载体共享。

## 后果

- 桌面应用复用已发布的 React 客户端与客户端插件图，不维护桌面 UI 分叉。
- 宿主不打开 HTTP 端口。协议请求仍经过序列化 API handler；事件流用明确错误帧结束，使共享 controller 能发起重连。
- built-bin 冒烟在无需显示器的 plain Node 下运行 main bundle；Electron 载体套件在具备显示环境的桌面 lane 中运行。组装后的 desktop profile 还以无密钥快照固定其模型可见表层提示词。
- Electron 增加一项明确放行的二进制下载，但不增加实现语言或发布工具链。贡献者与 CI 环境可能需要 Electron mirror。
- Chromium 使安装体积增加约 100 MB 或更多，并带来 Chromium 级常驻内存。Tauri 的系统 WebView 会显著更小。
- 签名分发仍需要 Developer ID 签名与公证。安装器和自动更新不在初始应用范围内。

如果产品出现低于 30 MB 的硬性体积限制、必须使用系统 WebView，或将 Rust 应用宿主定为标准，应重新评估该决策。这些要求会改变目前明显有利于 Electron 的标准，足以重新权衡 sidecar 与第二渲染引擎的成本。

## 考虑过的替代方案

**Tauri。** 它使用 WKWebView，在安装体积与内存上胜出；但 DeepSeek Harness 仍需 Node sidecar 承载 Cordis 与 Node 原生依赖。它还会增加 Rust 打包、sidecar 生命周期与诊断、原生操作额外跳转，以及测试矩阵中的第二个浏览器引擎。

**Electron 走 loopback HTTP。** 保留 web server 可以直接复用 `WebApiClient`，但会暴露端口，并为已经位于应用进程内的 renderer 保留 Host 信任配置。本地协议与 IPC 流载体在没有该 listener 的情况下仍保留现有 wire 序列化。

**PWA 或浏览器标签页外壳。** 它没有应用自有的 Node 宿主或窗口生命周期，也无法在没有外部进程的情况下提供桌面原生能力。

**原生 AppKit 或 SwiftUI 客户端。** 它能移除 Chromium，却需要重新实现 React 客户端与客户端插件系统，违反共享 GUI 架构。

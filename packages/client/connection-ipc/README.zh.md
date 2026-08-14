# @deepseek-ai/dsh-client-connection-ipc

[English](README.md) | 中文

桌面协议载体，零端口替代 webserver。node 半导出纯 `dsh://app` 请求→响应工厂（Electron 应用把它接入 `protocol.handle`——此包从不 import electron）：`/api/**` 走与浏览器载体相同的进程内 `toFetchHandler(apiProxy)`，`/plugins/<id>/client.js[.map]` 提供模块注册表解析出的 bundle，`/index.html` 提供注入 `window.__DSH_BOOT__` 后的构建 renderer（`injectBootManifest`），其余路径提供 vite dist 静态资源。browser 半在 `ElectronApiClient` 之上提供 `ctx.connection`——unary 调用走纯 `globalThis.fetch` 子类；mux/host 事件流走 IPC 推送通道（`createEventStreamPump` → 沙箱 preload 桥 → 客户端的 `openMux`/`openHost` 覆写），因为 Electron 会缓冲协议响应、无界 SSE body 无法流经 `dsh://`。plain Node 下（built-bin 冒烟）协议不存在，什么都不注册。页面只面对一个本地协议 authority，因此 loopback 姿态恒为真、也没有 Host 信任围栏：唯一的客户端就是应用自己的 renderer。

每个流泵把来源故障与意外结束转成终止 `stream/error` 帧。renderer 产出该帧，使 `ConnectionController` 能观察传输丢失并重连。中止或替换一个 generation 会退订并立即唤醒其待定 iterator；主动中止属于本地终止，不发送远端错误。

## Model Experience

Indirectly, through the transport plugins that consume it: the carrier moves already-composed wire envelopes between the renderer and the in-process gateway, and nothing here adds, filters, or rewrites anything that reaches a model request.

#### KV Cache effect

None: this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **unary 请求体逐次缓冲**——请求 body 以文本往返；浏览器桥所约束的图片上限级请求体同样约束此路径。
- **无 Host 信任围栏**——刻意为之：协议 authority 在应用进程之外不可达；假想的未来多窗口多来源桌面才需要围栏。
- **通用 RPC 通道（`dynamicCordisRunner` 等）没有桌面派发**——协议只路由 unary 方法表；在载体挂载 HostConnectionRpc 通道注册表之前，Cordis runner UI 降级（404）。

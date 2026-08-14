# @deepseek-ai/dsh-client-connection-core

[English](README.md) | 中文

与传输无关的连接核心，被每个客户端传输插件（浏览器 HTTP 载体与桌面协议载体）消费：`ConnectionController` 泵（两条下行流、带 `host.describe` 的严格就绪握手、指数退避重连、sink 异常隔离）、基于 fetch 的 `createConnectionRpc` 调用方、`ConnectionHandle`/`HostDescriptionSource` 契约与 `createHostDescriptionSource`。每种载体共用一份实现——传输插件只提供自己的 api 子类与 loopback 姿态；泵、握手与重连从不分叉。

## Model Experience

Indirectly, through the transport plugins that consume it: the controller and RPC caller move already-composed wire envelopes between the api client and business sinks, and nothing here adds, filters, or rewrites anything that reaches a model request.

#### KV Cache effect

None: this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- 任何一代连接丢失都会无条件重连；没有按载体区分的策略钩子（无法真正重连的传输可能仍偏好共享循环的握手语义）。

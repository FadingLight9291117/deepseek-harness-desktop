# `@deepseek-ai/dsh-desktop-app`

[English](README.md) | 中文

dsh 桌面表层 bundle。[`cordis.patch.yml`](cordis.patch.yml) 叠加在 [`dsh-web-app`](../web-app/README.md) 之上：禁用 HTTP 传输行（`webserver`、`web-runtime`、`client-hmr`、`connection`），并插入桌面胶水——本包的 `desktop-runtime` 插件、[`dsh-client-connection-ipc`](../../client/connection-ipc/README.md) 协议载体、[Electron 目录 provider](../../host/directory-picker-electron/README.md)及其与传输无关的原生客户端流程。插件把应用的装配事实（构建后的 renderer dist 根目录，由应用以 `ctx.desktopApp` 提供）重发布为 `desktopRuntime` 服务供载体消费，并注册 harness-source 与 desktop-surface 提示节。它还经应用在 Electron 下提供的可选 `desktopThemeSync` 服务，把应用的主题偏好（`ui-theme.preference`）同步到原生窗口配色。没有 URL 行、没有端口：整个客户端面对 `dsh://app` 协议 authority。

## Model Experience

### Harness-source 与 Desktop-surface 上下文

#### What the model sees

`harness:source` 节标识磁盘上的 Harness 实现而不声称它是工作目录，`app:desktop-surface` 全局节（order −98）把模型导向桌面应用："this window" 指代、CLI/web/桌面三表面共享同一 harness home，以及本表面没有 web 服务器、没有 URL、也不得启动一个。不注册 bash 运行时变量（web 表面的 `DSH_WEB_URL` 在此为假）。

#### Token effect

每个会话一行来源行与一段提示段落；每进程恒定。

#### KV Cache effect

表面节是固定全局节；各会话文本一致，KV 缓存保持命中。

## Known Limitations and Deferred Work

- desktop-surface 导向文本替代（而非补充）web-surface 文本——通过 web profile 创建的会话永远不会同时看到两者。
- 桌面载体自身的限制（协议流式、请求体缓冲、无信任围栏）见其 [README](../../client/connection-ipc/README.md)。
- 原生主题同步仅限桌面表面：没有 `desktopThemeSync` 服务时（headless 启动不提供），插件跳过同步并照常提供 `desktopRuntime`。

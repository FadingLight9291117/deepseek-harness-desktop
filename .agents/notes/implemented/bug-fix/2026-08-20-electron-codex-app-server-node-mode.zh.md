# Agent Note: 在 Electron Node 模式中运行 Codex app-server wrapper

Status: implemented

English | [English](2026-08-20-electron-codex-app-server-node-mode.md)

## Problem

`dsh-subagent-codex` 使用 `process.execPath` 启动 package-local Codex JavaScript wrapper。在 Electron 主进程中，该可执行文件是 Electron 而非 Node runtime，因此 wrapper 无法建立必需的 app-server 初始化握手。

## Decision

仅当 `process.versions.electron` 标识 Electron host 时，Codex provider 才向子进程环境加入 `ELECTRON_RUN_AS_NODE=1`。Electron 随后以 Node 模式执行自己的二进制文件来运行 package-local wrapper。Native Node 子进程收到完全相同的配置环境。

## Alternatives considered

**解析独立的 Node executable。** 未采用。Electron 已为其二进制文件提供受支持的 Node 执行模式；搜索另一个 executable 会引入依赖部署的路径选择。

**使用 host `codex` command。** 未采用。provider 拥有固定版本的 package-local Codex wrapper；PATH 查找可能选择不兼容的版本。

## Testing

Codex provider 测试验证 Electron 子进程环境携带该标记，且非 Electron 子进程保持输入环境对象不变。

## Consequences

Desktop Codex subagent 与 CLI 运行使用同一个固定版本的 wrapper 和协议。派生的 Electron 子进程获得一个固定 runtime 标记；其余用户提供的环境项保持不变。

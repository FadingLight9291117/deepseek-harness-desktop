# Agent Note: 从 dsh 启动 Desktop 应用

Status: implemented

English | [English](2026-08-20-dsh-desktop-launcher.md)

## Problem

macOS Desktop 应用和 `dsh` CLI 共享 profile，但需要不同的启动命令。已安装的应用没有用于定位并打开它的 CLI 命令。

## Decision

`dsh desktop` 通过 macOS `open` 打开 `~/Applications/DeepSeek.app`。该命令不启动 profile、不接受 app 参数，也不提供可配置的应用路径。它会在非 macOS 系统或已安装应用不存在时报告错误。

## Alternatives considered

**在 CLI 进程中启动 `desktop` profile。** 未采用。Desktop 应用拥有 Electron 的进程和 renderer 生命周期；Node CLI 进程不能替代它。

**搜索所有 Applications 目录。** 未采用。打包安装器拥有一个确定的目标位置；隐式发现可能打开过期或无关的应用。

## Consequences

全局 `@deepseek-ai/dsh` npm 包可在应用安装后启动 Desktop。`deepseek-desktop` 只会在发布命令中包含其 `dsh` 转发脚本，因此一次全局 npm 安装即可提供该命令，而不暴露安装器命令。将应用放在其他位置的用户必须通过 macOS 打开它，或将其安装到标准目标位置。

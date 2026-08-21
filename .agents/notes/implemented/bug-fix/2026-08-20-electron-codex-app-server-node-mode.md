# Agent Note: Run the Codex app-server wrapper in Electron Node mode

Status: implemented

English | [中文](2026-08-20-electron-codex-app-server-node-mode.zh.md)

## Problem

`dsh-subagent-codex` starts the package-local Codex JavaScript wrapper with `process.execPath`. In an Electron main process, that executable is Electron rather than the Node runtime, so the wrapper cannot establish the required app-server initialization handshake.

## Decision

The Codex provider adds `ELECTRON_RUN_AS_NODE=1` to the child environment only when `process.versions.electron` identifies an Electron host. Electron then executes its own binary as Node for the package-local wrapper. Native Node children receive the exact configured environment.

## Alternatives considered

**Resolve a separate Node executable.** Rejected. Electron already provides a supported Node execution mode for its binary, while searching for another executable would add deployment-specific path selection.

**Use the host `codex` command.** Rejected. The provider owns a pinned package-local Codex wrapper; a PATH lookup could select an incompatible version.

## Testing

The Codex provider test verifies that the Electron child environment carries the marker and that a non-Electron child preserves its input environment identity.

## Consequences

Desktop Codex subagents use the same pinned wrapper and protocol as CLI runs. The spawned Electron child receives one fixed runtime marker; user-provided environment entries remain otherwise unchanged.

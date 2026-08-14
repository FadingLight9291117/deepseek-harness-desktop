# Agent Note: Desktop shell tech selection: Electron vs Tauri

Status: implemented

English | [中文](2026-08-14-desktop-shell-tech-selection.zh.md)

## Problem

DeepSeek Harness needs a desktop shell that runs the shared Web UI, hosts the Node ESM and Cordis runtime without an HTTP listener, and can deepen native capabilities such as path opening and directory selection. The shell must preserve the package-level GUI layering described by the [GUI layering decision](../../implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol.md) instead of creating a second client implementation. The initial distribution scope is macOS without tray integration, system notifications, auto-update, or installers.

## Decision

The desktop shell uses Electron. `apps/desktop` owns the application lifecycle and boots the shared `desktop` profile from the same harness home as the CLI. The `desktop-app` bundle layers over `web-app`, disables the HTTP transport rows, and mounts the IPC carrier. The renderer receives the full shared client through `dsh://app`: static assets, injected boot manifest, client plugin bundles, and unary `/api` calls use the local protocol, while unbounded host and session streams use preload-mediated IPC push channels because Electron buffers custom-protocol responses.

Electron keeps the host in one Node process, so Cordis services, in-memory stores, NAPI dependencies, and native capability providers do not need a sidecar protocol. Its Chromium renderer also matches the engine used by the existing Playwright browser lane. Tauri would retain the Node host as a sidecar because the Rust core cannot load the repository's Node-native dependencies; it would add a process boundary, a Rust toolchain, and WKWebView coverage without replacing the Node runtime.

The renderer is sandboxed with context isolation. The preload exposes only the stream subscription methods required by the IPC carrier; the package containing the carrier does not import Electron. Transport-neutral connection state, RPC handles, and reconnect behavior remain in `dsh-client-connection-core`, shared by browser and desktop carriers.

## Consequences

- The desktop app reuses the shipped React client and client plugin graph instead of maintaining a desktop UI fork.
- The host opens no HTTP port. Protocol requests still cross the serialized API handler, while event streams terminate with an explicit error frame so the shared controller can reconnect.
- The built-bin smoke runs the main bundle under plain Node without a display; the Electron carrier suite runs in a display-capable desktop lane. The assembled desktop profile also owns a keyless snapshot of its model-visible surface prompt.
- Electron adds a deliberately allowed binary download but no new implementation language or release toolchain. Contributor and CI environments may need an Electron mirror.
- Chromium adds roughly 100 MB or more to the installed application and Chromium-class resident memory. Tauri's system WebView would be materially smaller.
- Signed distribution still requires Developer ID signing and notarization. Installers and auto-update remain outside the initial application scope.
- The desktop main process provides cross-platform `shell.openPath` and `dialog.showOpenDialog` closures. `dsh-host-directory-picker-electron` adapts the latter to the existing native interaction, while the gateway consumes the former through its optional native runtime; API consumers and the renderer remain unchanged. Paths pass through without macOS/Windows parsing, so Windows enablement does not require a second native-capability design.

This decision should be reconsidered if the product acquires a hard sub-30 MB binary limit, must use the system WebView, or standardizes on a Rust application host. Any of those requirements changes a criterion that currently favors Electron strongly enough to justify the sidecar and second-engine costs.

## Alternatives considered

**Tauri.** It wins installed size and memory by using WKWebView. It loses runtime fit because DeepSeek Harness still needs a Node sidecar for Cordis and Node-native dependencies, and it adds Rust packaging, sidecar lifecycle and diagnostics, an extra hop for native operations, and a second browser engine to the test matrix.

**Electron over loopback HTTP.** Keeping the web server would reuse `WebApiClient` directly, but it would expose a port and retain Host trust configuration for a renderer that is already in the application process. The local protocol and IPC stream carrier preserve the existing wire serialization without that listener.

**A PWA or browser-tab shell.** It has no application-owned Node host or window lifecycle and cannot supply desktop-native providers without an external process.

**A native AppKit or SwiftUI client.** It removes Chromium but requires a second implementation of the React client and client plugin system, contradicting the shared-GUI architecture.

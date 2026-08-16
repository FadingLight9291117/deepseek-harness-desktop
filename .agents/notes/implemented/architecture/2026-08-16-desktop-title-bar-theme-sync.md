# Agent Note: Desktop title bar follows the app theme

Status: implemented

English | [中文](2026-08-16-desktop-title-bar-theme-sync.zh.md)

## Problem

The desktop app's native window title bar follows the OS appearance only, while the app carries its own Light/Dark/System theme preference (the Appearance row in General settings, persisted as `ui-theme.preference` in `$DSH_HOME/settings.yaml`). When the app is set to dark while the OS is light — or vice versa — the title bar mismatches the content. The earlier immersive-title-bar attempt (custom drag strip, [2026-08-16-immersive-title-bar](2026-08-16-immersive-title-bar.md), later reverted) was rejected as ugly; the stock system bar stays, and it must follow the app's own theme.

## Decision

Host-side sync with no renderer, preload, or IPC changes:

- The preference already rides the host settings service: the renderer writes `ui-theme.preference` through `api.settings.mutate`, the settings provider commits it to disk and emits `settings/updated`.
- The desktop bundle plugin (`@deepseek-ai/dsh-desktop-app`) consumes an optional `desktopThemeSync` service: at activation it applies the persisted preference, then re-applies on every `settings/updated` for the `ui-theme` namespace. The service is absent in the headless boot, so the plugin no-ops there and still serves `desktopRuntime`.
- The Electron main process provides the service: `createDesktopNativeRuntime` (`apps/desktop/src/main/native.ts`) writes `nativeTheme.themeSource`; host-boot's prepare stage provides it as `desktopThemeSync`, under Electron only.
- The raw preference (`'light' | 'dark' | 'system'`) is forwarded, never the resolved color scheme. Electron propagates `nativeTheme.themeSource` into the renderer's `prefers-color-scheme`; pinning the resolved scheme would make `ThemeRuntime`'s `matchMedia` mirror the pin forever, freezing a `system` preference on the current OS scheme. Sending the preference keeps `themeSource='system'` intact, so native OS tracking survives.
- `settings/updated`, not `settings/document-updated`: the consumer-facing event, deep-equal gated, delivering the resolved value directly.
- No re-validation at the same-process typed boundary: `ThemeSettingsSchema` constrains the enum at the settings boundary, and `nativeTheme.themeSource` accepts the same union.

## Consequences

- The native title bar (and the macOS traffic lights) follows the app's Light/Dark/System setting immediately, including at boot before the renderer loads: the shipped profile layers guarantee the ui-theme namespace (web-app layer) registers before the desktop layer mounts, so the plugin's activation read sees the persisted document.
- Headless boot stays electron-free: `options.native` is undefined, the service is never provided, and the plugin's sync block is skipped.
- `themeSource` is process-global; the v1 single-window shell does not notice (documented in the desktop README).
- The one theoretical gap — a composition where the ui-theme namespace registers after the plugin activated and never commits again — cannot occur in the shipped layered profile. Flat single-include compositions miss the initial value until the first commit; the real-composition test mirrors the shipped layering for this reason.

## Alternatives considered

- **Renderer→main IPC of the resolved color scheme** — a preload method plus an `ipcMain` handler forwarding `ThemePresenter`'s resolved light/dark. Rejected: pins `themeSource` to the resolved value, which feeds back into the renderer's `prefers-color-scheme` and freezes `system` users (see Decision).
- **Sync from the OS theme only (`nativeTheme.shouldUseDarkColors`)** — what the reverted immersive-bar attempt did. Rejected: tracks the OS, not the app's own setting, so the title bar mismatches the content whenever the two diverge.
- **Window-level `setBackgroundColor` re-sync** — cosmetic resize-flash prevention; unnecessary while the renderer body covers the window.

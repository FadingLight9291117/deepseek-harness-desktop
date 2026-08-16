# Agent Note: Immersive title bar for the desktop shell

Status: implemented

English | [中文](2026-08-16-immersive-title-bar.zh.md)

## Problem

The desktop window shows the OS system title bar above the web UI, wasting vertical space and visually separating the app surface from the window chrome. The shell should use an immersive title bar: the UI extends to the window's top edge, macOS traffic lights float over the content, and Windows keeps its window-control overlay — all without a separate OS-drawn bar.

## Decision

The desktop shell hides the system title bar per platform and renders a 38px drag strip in the renderer that doubles as the window's drag surface:

- **Main process** — `desktopWindowChrome(platform, dark)` (`apps/desktop/src/main/window-boot.ts`) returns the window-chrome subset: macOS `titleBarStyle: 'hiddenInset'` with `trafficLightPosition: { x: 12, y: 12 }` so the lights center on the strip; Windows `titleBarStyle: 'hidden'` + `titleBarOverlay` with theme-matched `color`/`symbolColor` and the strip height; both get a theme-matched `backgroundColor` so resizes never flash. Other platforms keep the system bar. The window subscribes to `nativeTheme` updates and re-applies overlay/base colors when the OS theme flips.
- **Preload bridge** — exposes `platform` (Node `process.platform`) alongside `subscribeStream`; `dsh-client-connection-ipc` declares it on the global `dshDesktop` type.
- **Renderer** — `apps/desktop/src/renderer/main.ts` reads the bridge platform and sets `data-dsh-platform` on `<html>`; `titlebar.css` then renders `#dsh-titlebar` (index.html) as a fixed 38px `-webkit-app-region: drag` strip with a theme-base background and pads `body` by the same height. The web entry never sets the attribute, so the browser surface is unchanged.

The strip is empty: macOS draws the traffic lights over it, Windows draws its overlay controls on it; the DOM strip only provides the drag region and the blend-in background.

## Consequences

- The desktop UI gains ~38px of usable height and a native-feeling window; drag works from the top strip anywhere on it.
- Window-chrome color decisions stay in one pure function with unit coverage; the renderer's platform arm is a single attribute read.
- The strip height is a shared constant (`TITLE_BAR_HEIGHT` in window-boot.ts) and must stay in sync with `titlebar.css`'s 38px; changing one without the other misaligns the drag surface.
- Known limitation: the strip is one theme-base background across all three columns; the sidebar's distinct fill starts below it. A future per-column strip background would need layout-level cooperation.

## Alternatives considered

- **Full custom title bar (drawn controls on every platform)** — cross-platform consistency but a second control implementation (min/max/close IPC, hover states, snap affordances) with no native integration. Rejected: macOS/Windows already provide their controls natively and the pre-release scope favors minimal shell chrome.
- **CSS-only drag on the existing top row** — reusing the sidebar logo row as the drag surface avoids a dedicated strip but couples window chrome to layout components and leaves no drag region above the conversation column. Rejected: the fixed strip is layout-independent and works identically on the loading page and after settle.

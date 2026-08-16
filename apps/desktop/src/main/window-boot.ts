/**
 * Window-mode boot assembly: the Electron-native runtime wired into the host
 * tree. Separated from main/index.ts so the wiring is testable without the
 * entry module's launch side effects.
 * @module @deepseek-ai/dsh-desktop/main/window-boot
 */

import type { BrowserWindowConstructorOptions, TitleBarOverlay } from 'electron'
import type { BootDesktopHostOptions } from './host-boot.ts'
import { createDesktopNativeRuntime, type ElectronNativeApi } from './native.ts'

/**
 * Immersive window chrome for the packaged desktop shell: the system title
 * bar is hidden and the web UI's top edge becomes the drag surface. macOS
 * keeps the traffic lights floating over the content (hiddenInset); Windows
 * draws the window-control buttons over the content (titleBarOverlay). The
 * bar height matches the renderer's #dsh-titlebar strip (38px), and the
 * background matches the theme's base surface so the strip blends in.
 */

/** Light-theme base surface (--dsw-static-neutral-bluish-00). */
const LIGHT_BASE = '#ffffff'
/** Dark-theme base surface (--dsw-static-neutral-bluish-950). */
const DARK_BASE = '#151517'
/** Title-bar strip height, shared with the renderer's drag surface. */
export const TITLE_BAR_HEIGHT = 38

/** The window-chrome subset of BrowserWindow options the desktop shell owns. */
export interface DesktopWindowChromeOptions {
  /** Hidden title bar; macOS keeps traffic lights, Windows keeps overlay controls. */
  titleBarStyle?: 'hidden' | 'hiddenInset'
  /** Windows overlay controls (color follows the active theme); object form only. */
  titleBarOverlay?: TitleBarOverlay
  /** macOS traffic-light position so they center on the 38px strip. */
  trafficLightPosition?: NonNullable<BrowserWindowConstructorOptions['trafficLightPosition']>
  /** Window background so resizes never flash white/dark. */
  backgroundColor: string
}

/**
 * The platform window chrome for the immersive title bar.
 * @param platform - the Node process platform (darwin | win32 | others keep the system bar).
 * @param dark - whether the active theme is dark (drives overlay/base colors).
 * @returns the BrowserWindow options for the window strip.
 */
export function desktopWindowChrome(platform: string, dark: boolean): DesktopWindowChromeOptions {
  const base = { backgroundColor: dark ? DARK_BASE : LIGHT_BASE }
  if (platform === 'darwin') {
    return {
      ...base,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 12 },
    }
  }
  if (platform === 'win32') {
    return {
      ...base,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: dark ? DARK_BASE : LIGHT_BASE,
        symbolColor: dark ? LIGHT_BASE : DARK_BASE,
        height: TITLE_BAR_HEIGHT,
      },
    }
  }
  return base
}

/**
 * Build the window-mode boot options with the Electron-native path handoff
 * and directory-dialog runtime provided before the tree boots. The
 * desktop-app bundle's picker row reads the provided dialog closure at
 * service construction — booting without 'native' makes the window's
 * directory picker reject every call.
 * @param electron - the verified Electron main-process API namespace.
 * @param patchFiles - extra profile overlays in launcher argument order.
 * @param profileArgs - the invocation's inner arguments for the profile.
 * @returns options for {@link import('./host-boot.ts').bootDesktopHost} carrying the native runtime.
 */
export function windowBootOptions(
  electron: ElectronNativeApi,
  patchFiles: readonly string[],
  profileArgs: readonly string[],
): BootDesktopHostOptions {
  return {
    profile: 'desktop',
    patchFiles,
    args: profileArgs,
    native: createDesktopNativeRuntime(electron),
  }
}

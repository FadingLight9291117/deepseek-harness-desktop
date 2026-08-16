/**
 * Window-mode boot assembly: the Electron-native runtime wired into the host
 * tree. Separated from main/index.ts so the wiring is testable without the
 * entry module's launch side effects.
 * @module @deepseek-ai/dsh-desktop/main/window-boot
 */

import type { BootDesktopHostOptions } from './host-boot.ts'
import { createDesktopNativeRuntime, type ElectronNativeApi } from './native.ts'

/**
 * Build the window-mode boot options with the Electron-native path handoff
 * and directory-dialog runtime provided before the tree boots. The
 * desktop-app bundle's picker row reads the provided dialog closure at
 * service construction — booting without `native` makes the window's
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

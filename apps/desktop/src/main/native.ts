/**
 * Electron-native operations owned by the desktop main process. The Cordis
 * tree receives platform-neutral closures, so no plugin package imports
 * Electron and macOS/Windows share the same integration.
 * @module @deepseek-ai/dsh-desktop/main/native
 */

import type { OpenDialogOptions, OpenDialogReturnValue } from 'electron'
import type { DesktopThemeSync } from '@deepseek-ai/dsh-desktop-app'
import type { NativePathRuntime } from '@deepseek-ai/dsh-host-apiproxy'
import type { ElectronDirectoryPickerRuntime } from '@deepseek-ai/dsh-host-directory-picker-electron'

/** Electron main-process APIs consumed by the native adapters. */
export type ElectronNativeApi = Pick<typeof import('electron'), 'BrowserWindow' | 'dialog' | 'shell' | 'nativeTheme'>

/** Native capability objects provided to the booted host tree. */
export interface DesktopNativeRuntime {
  /** Native path handoff consumed by the API gateway. */
  path: NativePathRuntime
  /** Native directory dialog consumed by the Electron picker provider. */
  directoryPicker: ElectronDirectoryPickerRuntime
  /** Native color-scheme sync consumed by the desktop bundle's theme row. */
  theme: DesktopThemeSync
}

/** Wait for a dialog result while settling the caller immediately on abort. */
function waitForDialog(operation: Promise<OpenDialogReturnValue>, signal: AbortSignal): Promise<OpenDialogReturnValue> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (): boolean => {
      if (settled) return false
      settled = true
      signal.removeEventListener('abort', onAbort)
      return true
    }
    const onAbort = (): void => {
      if (finish()) reject(signal.reason)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
    void operation.then(
      (value) => { if (finish()) resolve(value) },
      (error) => { if (finish()) reject(error) },
    )
  })
}

/**
 * Build the path and directory adapters around Electron's cross-platform APIs.
 * Paths pass through unchanged, including Windows drive and UNC paths.
 * @param electron - Electron main-process API namespace.
 * @returns native operations to provide before the Cordis tree boots.
 */
export function createDesktopNativeRuntime(electron: ElectronNativeApi): DesktopNativeRuntime {
  const openPath = async (path: string, signal: AbortSignal): Promise<void> => {
    signal.throwIfAborted()
    const error = await electron.shell.openPath(path)
    if (error !== '') throw new Error(error)
  }

  return {
    path: {
      openPath,
      openTextFile: openPath,
      canOpenPath: () => true,
    },
    directoryPicker: {
      async pickDirectory(signal) {
        signal.throwIfAborted()
        const options: OpenDialogOptions = {
          title: 'Select Workspace Directory',
          properties: ['openDirectory'],
        }
        const parent = electron.BrowserWindow.getFocusedWindow()
          ?? electron.BrowserWindow.getAllWindows()[0]
        const operation = parent === undefined
          ? electron.dialog.showOpenDialog(options)
          : electron.dialog.showOpenDialog(parent, options)
        const result = await waitForDialog(operation, signal)
        return result.canceled ? null : result.filePaths[0] ?? null
      },
    },
    theme: {
      setThemePreference: (preference) => {
        electron.nativeTheme.themeSource = preference
      },
    },
  }
}

/**
 * Electron backend of the directory-picker seam. The application owns the
 * Electron import and provides one platform-neutral dialog closure before the
 * Cordis tree boots; this package only adapts that closure to
 * `ctx.directoryPicker`, so it remains testable without a GUI or Electron
 * binary. The same provider serves macOS and Windows.
 * @module @deepseek-ai/dsh-host-directory-picker-electron
 */

import type { Context } from '@deepseek-ai/cordis'
import { DirectoryPicker } from '@deepseek-ai/dsh-host-directory-picker'
import type { DirectoryPickerCapability } from '@deepseek-ai/dsh-host-directory-picker'

/** Application-owned Electron directory dialog available to the host tree. */
export interface ElectronDirectoryPickerRuntime {
  /**
   * Open one Electron directory dialog.
   * @param signal - caller/connection lifetime.
   * @returns the selected absolute path unchanged, or null when cancelled.
   */
  pickDirectory(signal: AbortSignal): Promise<string | null>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Dialog closure supplied by the Electron main process. */
    electronDirectoryPickerRuntime: ElectronDirectoryPickerRuntime
  }
}

/** Electron implementation of `ctx.directoryPicker`. */
export default class ElectronDirectoryPicker extends DirectoryPicker {
  private readonly electronCapability: DirectoryPickerCapability

  /**
   * Capture the app-provided dialog closure for this service lifetime.
   * @param ctx - plugin context carrying the optional Electron runtime.
   */
  constructor(ctx: Context) {
    super(ctx)
    const runtime = ctx.get('electronDirectoryPickerRuntime')
    this.electronCapability = {
      kind: 'native',
      pick: signal => runtime === undefined
        ? Promise.reject(new Error('Electron directory picker is unavailable outside the desktop window runtime'))
        : runtime.pickDirectory(signal),
    }
  }

  /**
   * Return the stable Electron-native interaction.
   * @returns the capability captured for this service lifetime.
   */
  capability(): DirectoryPickerCapability {
    return this.electronCapability
  }
}

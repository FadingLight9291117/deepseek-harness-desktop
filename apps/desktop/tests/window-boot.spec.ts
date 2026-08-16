/** Window-mode boot assembly: the Electron-native runtime must reach the host tree. */

import { describe, expect, it, vi } from 'vitest'
import type { ElectronNativeApi } from '../src/main/native.ts'
import { windowBootOptions } from '../src/main/window-boot.ts'

function electronApi(): ElectronNativeApi {
  return {
    shell: { openPath: vi.fn().mockResolvedValue('') },
    dialog: { showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }) },
    BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
    nativeTheme: { themeSource: 'system' },
  } as unknown as ElectronNativeApi
}

describe('windowBootOptions', () => {
  it('wires the Electron-native runtime into the window-mode boot', async () => {
    const electron = electronApi()
    const options = windowBootOptions(electron, ['overlay.patch.yml'], ['task'])

    expect(options.profile).toBe('desktop')
    expect(options.patchFiles).toEqual(['overlay.patch.yml'])
    expect(options.args).toEqual(['task'])
    // The window tree's picker row reads its dialog closure at service
    // construction; options without `native` make every pickDirectory call
    // reject with the runtime guard's unavailable message.
    expect(options.native).toBeDefined()
    expect(options.native?.path.canOpenPath()).toBe(true)
    const controller = new AbortController()
    controller.abort(new Error('caller left'))
    await expect(options.native?.directoryPicker.pickDirectory(controller.signal))
      .rejects.toThrow('caller left')
    // The theme sync rides the same seam: the host tree provides it as
    // desktopThemeSync, and its closure writes nativeTheme.themeSource.
    expect(options.native?.theme).toBeDefined()
    options.native?.theme.setThemePreference('dark')
    expect(electron.nativeTheme.themeSource).toBe('dark')
  })
})

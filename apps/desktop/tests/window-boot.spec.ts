/** Window-mode boot assembly: the Electron-native runtime must reach the host tree. */

import { describe, expect, it, vi } from 'vitest'
import type { ElectronNativeApi } from '../src/main/native.ts'
import { desktopWindowChrome, TITLE_BAR_HEIGHT, windowBootOptions } from '../src/main/window-boot.ts'

function electronApi(): ElectronNativeApi {
  return {
    shell: { openPath: vi.fn().mockResolvedValue('') },
    dialog: { showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }) },
    BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  } as unknown as ElectronNativeApi
}

describe('windowBootOptions', () => {
  it('wires the Electron-native runtime into the window-mode boot', async () => {
    const options = windowBootOptions(electronApi(), ['overlay.patch.yml'], ['task'])

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
  })
})

describe('desktopWindowChrome', () => {
  it('keeps the system title bar on non-desktop platforms with theme base background', () => {
    const chrome = desktopWindowChrome('linux', false)
    expect(chrome.titleBarStyle).toBeUndefined()
    expect(chrome.titleBarOverlay).toBeUndefined()
    expect(chrome.backgroundColor).toBe('#ffffff')
    expect(desktopWindowChrome('linux', true).backgroundColor).toBe('#151517')
  })

  it('hides the macOS title bar with inset traffic lights on the 38px strip', () => {
    const chrome = desktopWindowChrome('darwin', false)
    expect(chrome.titleBarStyle).toBe('hiddenInset')
    expect(chrome.trafficLightPosition).toEqual({ x: 12, y: 12 })
    expect(chrome.titleBarOverlay).toBeUndefined()
    expect(chrome.backgroundColor).toBe('#ffffff')
  })

  it('hides the Windows title bar with theme-colored overlay controls', () => {
    const light = desktopWindowChrome('win32', false)
    expect(light.titleBarStyle).toBe('hidden')
    expect(light.titleBarOverlay).toEqual({
      color: '#ffffff',
      symbolColor: '#151517',
      height: TITLE_BAR_HEIGHT,
    })
    const dark = desktopWindowChrome('win32', true)
    expect(dark.titleBarOverlay).toEqual({
      color: '#151517',
      symbolColor: '#ffffff',
      height: TITLE_BAR_HEIGHT,
    })
    expect(dark.backgroundColor).toBe('#151517')
  })
})

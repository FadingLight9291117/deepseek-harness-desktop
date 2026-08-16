/** Cross-platform Electron native adapter behavior without opening a GUI. */

import { describe, expect, it, vi } from 'vitest'
import { createDesktopNativeRuntime, type ElectronNativeApi } from '../src/main/native.ts'

function electronApi(options?: {
  openPath?: (path: string) => Promise<string>
  showOpenDialog?: (...args: unknown[]) => Promise<{ canceled: boolean; filePaths: string[] }>
  focusedWindow?: object | null
  themeSource?: string
}): ElectronNativeApi {
  const nativeTheme = {
    themeSource: options?.themeSource ?? 'system',
  }
  return {
    shell: {
      openPath: options?.openPath ?? vi.fn().mockResolvedValue(''),
    },
    dialog: {
      showOpenDialog: options?.showOpenDialog ?? vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
    },
    BrowserWindow: {
      getFocusedWindow: () => options?.focusedWindow ?? null,
      getAllWindows: () => [],
    },
    nativeTheme,
  } as unknown as ElectronNativeApi
}

describe('createDesktopNativeRuntime', () => {
  it('hands Windows paths to Electron unchanged and reports shell failures', async () => {
    const openPath = vi.fn().mockResolvedValueOnce('').mockResolvedValueOnce('association failed')
    const runtime = createDesktopNativeRuntime(electronApi({ openPath }))
    const signal = new AbortController().signal

    await expect(runtime.path.openPath('C:\\Users\\alice\\work', signal)).resolves.toBeUndefined()
    expect(openPath).toHaveBeenNthCalledWith(1, 'C:\\Users\\alice\\work')
    await expect(runtime.path.openTextFile('\\\\server\\share\\notes.txt', signal))
      .rejects.toThrow('association failed')
    expect(openPath).toHaveBeenNthCalledWith(2, '\\\\server\\share\\notes.txt')
    expect(runtime.path.canOpenPath()).toBe(true)
  })

  it('returns the selected directory unchanged and parents the dialog to the focused window', async () => {
    const parent = {}
    const showOpenDialog = vi.fn().mockResolvedValue({ canceled: false, filePaths: ['C:\\work'] })
    const runtime = createDesktopNativeRuntime(electronApi({ showOpenDialog, focusedWindow: parent }))

    await expect(runtime.directoryPicker.pickDirectory(new AbortController().signal))
      .resolves.toBe('C:\\work')
    expect(showOpenDialog).toHaveBeenCalledWith(parent, {
      title: 'Select Workspace Directory',
      properties: ['openDirectory'],
    })
  })

  it('maps dialog cancellation to null', async () => {
    const runtime = createDesktopNativeRuntime(electronApi())
    await expect(runtime.directoryPicker.pickDirectory(new AbortController().signal)).resolves.toBeNull()
  })

  it('does not start a native operation for an already-aborted caller', async () => {
    const showOpenDialog = vi.fn()
    const runtime = createDesktopNativeRuntime(electronApi({ showOpenDialog }))
    const controller = new AbortController()
    controller.abort(new Error('caller left'))
    await expect(runtime.directoryPicker.pickDirectory(controller.signal)).rejects.toThrow('caller left')
    expect(showOpenDialog).not.toHaveBeenCalled()
  })

  it('settles an in-flight caller on abort and ignores the eventual dialog result', async () => {
    let finishDialog: ((value: { canceled: boolean; filePaths: string[] }) => void) | undefined
    const showOpenDialog = vi.fn().mockImplementation(() => new Promise((resolve) => { finishDialog = resolve }))
    const runtime = createDesktopNativeRuntime(electronApi({ showOpenDialog }))
    const controller = new AbortController()
    const selection = runtime.directoryPicker.pickDirectory(controller.signal)
    controller.abort(new Error('connection closed'))
    await expect(selection).rejects.toThrow('connection closed')
    finishDialog?.({ canceled: false, filePaths: ['C:\\late'] })
  })

  it('writes the theme preference through to nativeTheme.themeSource', () => {
    const electron = electronApi({ themeSource: 'system' })
    const runtime = createDesktopNativeRuntime(electron)
    runtime.theme.setThemePreference('dark')
    expect(electron.nativeTheme.themeSource).toBe('dark')
    runtime.theme.setThemePreference('system')
    expect(electron.nativeTheme.themeSource).toBe('system')
  })
})

/** Electron directory-picker provider registration and delegation behavior. */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import ElectronDirectoryPicker from '../src/index.ts'

describe('ElectronDirectoryPicker', () => {
  it('registers a stable native capability and preserves Windows paths', async () => {
    const ctx = new Context()
    const pickDirectory = vi.fn().mockResolvedValue('C:\\Users\\alice\\work')
    ctx.provide('electronDirectoryPickerRuntime', { pickDirectory })
    const fiber = ctx.plugin(ElectronDirectoryPicker)
    await fiber.await()

    const picker = ctx.get('directoryPicker')
    const capability = picker!.capability()
    const signal = new AbortController().signal
    expect(capability.kind).toBe('native')
    if (capability.kind !== 'native') throw new Error('unreachable')
    await expect(capability.pick(signal)).resolves.toBe('C:\\Users\\alice\\work')
    expect(pickDirectory).toHaveBeenCalledWith(signal)
    expect(picker!.capability()).toBe(capability)

    await fiber.dispose()
    expect(ctx.get('directoryPicker')).toBeUndefined()
  })

  it('fails loudly when the headless smoke invokes a desktop-only dialog', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(ElectronDirectoryPicker)
    await fiber.await()
    const capability = ctx.directoryPicker.capability()
    if (capability.kind !== 'native') throw new Error('unreachable')
    await expect(capability.pick(new AbortController().signal))
      .rejects.toThrow('unavailable outside the desktop window runtime')
    await fiber.dispose()
  })
})

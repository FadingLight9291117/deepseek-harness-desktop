import { describe, expect, it } from 'vitest'
import { parseDesktopArgs } from '../src/main/args.ts'

describe('desktop launcher arguments', () => {
  it('extracts repeatable patch overlays before the profile arguments', () => {
    expect(parseDesktopArgs([
      '--headless-boot',
      '--patch', 'first.yml',
      '--patch=second.yml',
      '--port', '0',
    ])).toEqual({
      headless: true,
      patchFiles: ['first.yml', 'second.yml'],
      profileArgs: ['--port', '0'],
    })
  })

  it('leaves launcher-looking values after the first profile argument untouched', () => {
    expect(parseDesktopArgs(['--port', '0', '--patch', 'inner.yml'])).toEqual({
      headless: false,
      patchFiles: [],
      profileArgs: ['--port', '0', '--patch', 'inner.yml'],
    })
    expect(parseDesktopArgs(['--patch', 'outer.yml', '--', '--patch', 'inner.yml'])).toEqual({
      headless: false,
      patchFiles: ['outer.yml'],
      profileArgs: ['--patch', 'inner.yml'],
    })
  })

  it.each([
    ['--patch'],
    ['--patch='],
    ['--patch', ''],
  ])('rejects a patch flag without a path: %j', (...args) => {
    expect(() => parseDesktopArgs(args)).toThrow('dsh desktop: --patch needs a path')
  })
})

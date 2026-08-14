/** Desktop launcher arguments owned before the profile receives its inner arguments. */

/** One parsed desktop invocation. */
export interface DesktopInvocation {
  /** Whether to boot the host without importing Electron or creating a window. */
  headless: boolean
  /** Extra profile patch overlays, in launcher argument order. */
  patchFiles: string[]
  /** Arguments handed verbatim to the booted profile. */
  profileArgs: string[]
}

/**
 * Parse desktop-owned flags until the first profile argument.
 * @param args - arguments after the Electron app or Node entry path.
 * @returns the desktop mode, patch overlays, and remaining profile arguments.
 */
export function parseDesktopArgs(args: readonly string[]): DesktopInvocation {
  let headless = false
  const patchFiles: string[] = []
  let index = 0
  for (; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--') {
      index += 1
      break
    }
    if (argument === '--headless-boot') {
      headless = true
      continue
    }
    if (argument === '--patch') {
      const path = args[index + 1]
      if (path === undefined || path === '') throw new Error('dsh desktop: --patch needs a path')
      patchFiles.push(path)
      index += 1
      continue
    }
    if (argument?.startsWith('--patch=')) {
      const path = argument.slice('--patch='.length)
      if (path === '') throw new Error('dsh desktop: --patch needs a path')
      patchFiles.push(path)
      continue
    }
    break
  }
  return { headless, patchFiles, profileArgs: args.slice(index) }
}

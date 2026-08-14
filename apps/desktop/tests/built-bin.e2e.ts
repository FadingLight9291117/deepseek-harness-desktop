import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'

/** Published-entry acceptance for the windowless desktop boot (built lib under plain node, no Electron). */
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const desktopMain = join(repoRoot, 'apps/desktop/lib/index.js')
const READY_MARKER = 'dsh desktop: host ready'

async function waitFor(check: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 20_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(`dsh desktop boot marker did not appear: ${what}`)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

describe.skipIf(!existsSync(desktopMain))('dsh desktop BUILT main (node lib/index.js, no tsx)', () => {
  // The smoke owns its lifetime through SIGTERM, which Windows does not
  // deliver to a spawned process; the win32 parity path (interrupt marker,
  // as in apps/cli's built-bin suite) lands with the Windows port.
  it.skipIf(process.platform === 'win32')('boots the desktop profile headless with zero ports and disposes on SIGTERM', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-built-'))
    const child = execa(process.execPath, [desktopMain, '--headless-boot', '--port', '0'], {
      cwd: home,
      input: '',
      reject: false,
      timeout: 25_000,
      killSignal: 'SIGKILL',
      env: {
        DSH_HOME: home,
        DSH_TELEMETRY_DISABLED: '1',
      },
    })
    let output = ''
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    try {
      await waitFor(() => output.includes(READY_MARKER), 'dsh desktop: host ready')
      // The desktop-app layer disabled the webserver row: the web-runtime
      // URL line must never print, proving the zero-port composition (the
      // desktop carrier serves the client through the dsh:// protocol, which
      // plain Node cannot exercise — the carrier e2e covers it).
      expect(output).not.toContain('dsh web: http')
      child.kill('SIGTERM')
      const result = await child
      expect(result.exitCode, output).toBe(0)
      expect(result.signal).toBeUndefined()
    } finally {
      child.kill('SIGKILL')
      rmSync(home, { recursive: true, force: true })
    }
  }, 30_000)
})

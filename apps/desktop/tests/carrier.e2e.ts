/**
 * Desktop carrier e2e: the real built Electron app over Playwright's
 * _electron driver. Proves the zero-port transport end to end — the boot
 * manifest injection, a unary RPC round-trip through the protocol to the
 * in-process gateway, a live event-stream frame through the IPC push chain
 * (preload bridge → host-side pump → gateway), and the settled web UI DOM.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron, type ElectronApplication, type Page } from 'playwright'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const desktopApp = join(repoRoot, 'apps/desktop')

/** The preload bridge surface the renderer exposes (mirror of the client half's global declaration). */
interface DesktopBridge {
  subscribeStream(stream: 'mux' | 'host', onFrame: (frame: unknown) => void): () => void
}

async function waitFor(check: () => boolean, what: string, deadlineMs = 30_000): Promise<void> {
  const deadline = Date.now() + deadlineMs
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(`carrier e2e: ${what} did not appear within ${String(deadlineMs)}ms`)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

describe.skipIf(process.platform !== 'darwin' && process.env.CI === undefined && process.env.DSH_DESKTOP_E2E === undefined)('desktop carrier (built Electron app)', () => {
  let home: string
  let app: ElectronApplication
  let page: Page
  let appOutput: string

  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), 'dsh-desktop-e2e-'))
    appOutput = ''
    app = await _electron.launch({
      args: [desktopApp, '--port', '0'],
      env: {
        ...process.env,
        DSH_HOME: home,
        DSH_TELEMETRY_DISABLED: '1',
      },
    })
    const collect = (chunk: Buffer | string): void => {
      appOutput += chunk.toString()
    }
    app.process().stdout?.on('data', collect)
    app.process().stderr?.on('data', collect)
    page = await app.firstWindow()
    page.on('console', (message) => { appOutput += `[renderer-console] ${message.text()}\n` })
    page.on('pageerror', (error) => { appOutput += `[renderer-pageerror] ${String(error)}\n` })
    await page.waitForLoadState('domcontentloaded')
  })

  afterEach(async () => {
    await app?.close()
    rmSync(home, { recursive: true, force: true })
  })

  it('injects the boot manifest, serves a unary RPC round-trip, pushes a live stream frame, and settles the web UI', async () => {
    console.log('[carrier-e2e] step 1: boot manifest')
    // 1. Boot manifest: the host graph reached the renderer through the
    // protocol index route.
    await waitFor(() => appOutput.includes('dsh desktop: window created'), 'window-created marker', 60_000)
    const manifest = await page.evaluate(() => {
      const value = (globalThis as unknown as { __DSH_BOOT__?: { entries?: Array<{ id: string }> } }).__DSH_BOOT__
      return value === undefined ? undefined : { count: value.entries?.length, ids: value.entries?.map(entry => entry.id) }
    })
    expect(manifest, appOutput).toBeDefined()
    expect(manifest?.count, appOutput).toBeGreaterThan(10)
    expect(manifest?.ids, appOutput).toContain('@deepseek-ai/dsh-client-connection-ipc')

    console.log('[carrier-e2e] step 2: unary RPC')
    // 2. Unary RPC: the renderer-side fetch rides dsh://app/api to the
    // in-process gateway and back, with the full wire envelope.
    const roundTrip = await page.evaluate(async () => {
      const response = await fetch('/api/session.list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'carrier-e2e-list', method: 'session.list', payload: {} }),
        signal: AbortSignal.timeout(20_000),
      })
      return { status: response.status, body: await response.json() as unknown }
    })
    expect(roundTrip.status, appOutput).toBe(200)
    expect(roundTrip.body, appOutput).toMatchObject({ type: 'server-response', rpcId: 'carrier-e2e-list', result: { ok: true } })

    console.log('[carrier-e2e] step 3: push stream')
    // 3. Live event streams: the protocol cannot stream an unbounded SSE
    // body (Electron buffers protocol responses), so the mux/host streams
    // ride IPC push channels — preload bridge → host-side pump → the
    // gateway. Subscribe FIRST, then create the session: the subscribed
    // baseline and the session/event frames must arrive live (a listener
    // attached after the baseline would see nothing until the next event).
    const muxFrames = await Promise.race([
      page.evaluate(async (): Promise<{ createdOk: boolean; methods: string[]; reason?: string }> => {
        const bridge = (globalThis.window as Window & { dshDesktop?: DesktopBridge }).dshDesktop
        if (bridge === undefined) return { createdOk: false, methods: [], reason: 'no preload bridge' }
        const methods: string[] = []
        const off = bridge.subscribeStream('mux', (frame: unknown) => {
          const method = (frame as { method?: unknown }).method
          methods.push(typeof method === 'string' ? method : '?')
        })
        try {
          const created = await fetch('/api/session.create', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'client-request', rpcId: 'carrier-e2e-create', method: 'session.create', payload: {} }),
            signal: AbortSignal.timeout(20_000),
          })
          const body = await created.json() as { result?: { ok?: boolean } }
          // The pump needs a moment to drain the queued frames.
          const deadline = Date.now() + 10_000
          while (Date.now() < deadline && methods.length === 0) {
            await new Promise(resolve => setTimeout(resolve, 50))
          }
          return { createdOk: body.result?.ok === true, methods }
        } finally {
          off()
        }
      }),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => { reject(new Error('push-stream evaluate timeout')) }, 40_000)
      }),
    ])
    expect(muxFrames.createdOk, `${JSON.stringify(muxFrames)}\n${appOutput}`).toBe(true)
    expect(muxFrames.methods.length, `${JSON.stringify(muxFrames)}\n${appOutput}`).toBeGreaterThan(0)

    console.log('[carrier-e2e] step 4: settled UI')
    // 4. The settled web UI: the shell kernel mounted the real interface
    // (the chat composer is the stable landmark of the assembled app — the
    // same selector the browser lane's smoke uses).
    await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30_000 })
    await waitFor(
      () => appOutput.includes('dsh desktop: window created'),
      'window-created marker',
    )
  }, 120_000)
})

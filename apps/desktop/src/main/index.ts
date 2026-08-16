/**
 * dsh desktop — Electron main entry.
 *
 * Two lifetimes: `--headless-boot` boots the host tree with no window and
 * leaves lifetime to the signal handlers (the built-bin smoke runs this under
 * plain Node, where the `electron` module cannot exist); without it, the
 * process must run under Electron and the app owns a window plus the host
 * tree, quitting when the window closes.
 *
 * The entry module must evaluate to completion without awaiting anything:
 * Electron emits its `ready` event only after the ESM main entry finishes
 * evaluating, so a top-level `await app.whenReady()` deadlocks (the entry
 * waits for an event that waits for the entry). The async lifetime therefore
 * starts from a fire-and-forget call instead.
 * @module @deepseek-ai/dsh-desktop/main
 */

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createDesktopProtocolHandler, createEventStreamPump } from '@deepseek-ai/dsh-client-connection-ipc'
import { API_PATH } from '@deepseek-ai/dsh-client-connection'
import { toFetchHandler } from '@deepseek-ai/dsh-host-apiproxy'
import { parseDesktopArgs } from './args.ts'
import { bootDesktopHost, rendererDistRoot } from './host-boot.ts'
import { windowBootOptions } from './window-boot.ts'

/** Sandboxed preload bundle selected across the nested source main/ and flattened built lib/ layouts. */
const BUILT_PRELOAD_INDEX = fileURLToPath(new URL('./preload/index.cjs', import.meta.url))
const PRELOAD_INDEX = existsSync(BUILT_PRELOAD_INDEX)
  ? BUILT_PRELOAD_INDEX
  : fileURLToPath(new URL('../../lib/preload/index.cjs', import.meta.url))

const invocation = parseDesktopArgs(process.argv.slice(2))

function reportStartupFailure(error: unknown): void {
  console.error(error)
  process.exit(1)
}

if (invocation.headless) {
  void bootDesktopHost({ profile: 'desktop', patchFiles: invocation.patchFiles, args: invocation.profileArgs }).catch(reportStartupFailure)
} else {
  void runWindow(invocation.patchFiles, invocation.profileArgs).catch(reportStartupFailure)
}

/**
 * The window lifetime: resolve the real Electron surface (in a plain-node
 * process the electron package resolves to the binary path string, never an
 * app — fail loud instead of booting a windowless tree by accident; the type
 * assertion admits the runtime reality the electron typings cannot express),
 * boot the host tree, then create the window once the app is ready.
 * @param patchFiles - extra profile overlays in launcher argument order.
 * @param profileArgs - the invocation's inner arguments for the profile.
 */
async function runWindow(patchFiles: readonly string[], profileArgs: readonly string[]): Promise<void> {
  const electron = await import('electron') as unknown as Partial<typeof import('electron')>
  const { app: electronApp, BrowserWindow, dialog, ipcMain, protocol, shell } = electron
  if (electronApp === undefined || BrowserWindow === undefined || dialog === undefined
    || ipcMain === undefined || protocol === undefined || shell === undefined) {
    process.stderr.write('dsh desktop: not running under Electron; use --headless-boot for a windowless boot\n')
    process.exit(2)
  }
  // Scheme privileges must be registered before app ready — register
  // immediately, before the host boot's awaits can let ready fire.
  protocol.registerSchemesAsPrivileged([{
    scheme: 'dsh',
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  }])
  const desktop = await bootDesktopHost(windowBootOptions(
    { BrowserWindow, dialog, shell },
    patchFiles,
    profileArgs,
  ))
  // The zero-port carrier: serve the whole client — index with boot
  // manifest, bundles, assets, /api — from the booted host tree. /api
  // mirrors the web transport's shared handler: the connection RPC
  // channels (typert remotes) first, the in-process gateway as fallback.
  const apiDispatch = desktop.connection.createSharedFetchHandler(API_PATH, {
    fetch: request => toFetchHandler(desktop.ctx.apiProxy).fetch(request),
  })
  protocol.handle('dsh', createDesktopProtocolHandler({
    api: apiDispatch,
    apiProxy: desktop.ctx.apiProxy,
    modules: desktop.ctx.get('clientModules'),
    distRoot: rendererDistRoot(),
  }))
  await electronApp.whenReady()
  // One pump per (sender, stream), refcounted across the renderer's
  // listeners: `ipcRenderer.on` is channel-wide, so every listener on the
  // channel receives each pushed frame — the pump dies only when the last
  // listener unsubscribes (or the sender is destroyed).
  const streamPumps = new Map<string, { dispose: () => void; listeners: number }>()
  const pumpKey = (senderId: number, stream: string): string => `${String(senderId)}:${stream}`
  const isEventStream = (value: unknown): value is 'mux' | 'host' => value === 'mux' || value === 'host'
  ipcMain.on('dsh:subscribe', (event, stream: unknown) => {
    if (!isEventStream(stream)) return
    const key = pumpKey(event.sender.id, stream)
    const entry = streamPumps.get(key)
    if (entry !== undefined) {
      entry.listeners += 1
      return
    }
    const dispose = createEventStreamPump(desktop.ctx.apiProxy, stream, {
      send: (channel, frame) => {
        if (!event.sender.isDestroyed()) event.sender.send(channel, frame)
      },
    })
    streamPumps.set(key, { dispose, listeners: 1 })
    event.sender.once('destroyed', () => {
      streamPumps.get(key)?.dispose()
      streamPumps.delete(key)
    })
  })
  ipcMain.on('dsh:unsubscribe', (event, stream: unknown) => {
    if (!isEventStream(stream)) return
    const key = pumpKey(event.sender.id, stream)
    const entry = streamPumps.get(key)
    if (entry === undefined) return
    entry.listeners -= 1
    if (entry.listeners <= 0) {
      entry.dispose()
      streamPumps.delete(key)
    }
  })
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: PRELOAD_INDEX,
    },
  })
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    process.stderr.write(`dsh desktop: renderer failed to load ${url}: ${code} ${description}\n`)
  })
  process.stdout.write('dsh desktop: window created\n')
  // The whole client (index, manifest, bundles, assets, /api) faces one
  // protocol authority — no file:// loading, no port.
  void window.loadURL('dsh://app/index.html')
  electronApp.on('window-all-closed', () => {
    void desktop.shutdown.shutdown(0).then(() => { electronApp.quit() })
  })
}

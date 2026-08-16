/**
 * Desktop application entry: thin bootstrap over the shell library. Everything —
 * loader holding, module-table seeding, AppRoot gate, plugin assembly — lives
 * in @deepseek-ai/dsh-client-web; this file only finds the mount point. The
 * transport is the protocol carrier (the connection-ipc roster row provides
 * ctx.connection), so the boot is identical to the web entry.
 *
 * The desktop surface additionally arms the immersive title bar: the preload
 * bridge carries the Node platform, and the strip (index.html #dsh-titlebar)
 * only renders once `data-dsh-platform` lands on <html> — the web entry never
 * sets it, so the browser surface keeps the system title bar.
 */

/** The preload bridge surface the renderer reads (see connection-ipc's global declaration). */
interface DesktopBridge {
  /** The Node platform the desktop app runs on ('darwin' | 'win32' | ...). */
  platform: string
  subscribeStream(stream: 'mux' | 'host', onFrame: (frame: unknown) => void): () => void
}

declare global {
  interface Window {
    /** The sandboxed preload bridge (absent when the preload did not load). */
    dshDesktop?: DesktopBridge
  }
}

import { AppWebEntry } from '@deepseek-ai/dsh-client-web'
import './titlebar.css'

const el = document.getElementById('root')
if (el === null) throw new Error('desktop app: missing #root')

// The preload bridge exists only under Electron; its platform arms the strip.
const platform = window.dshDesktop?.platform
if (platform !== undefined) {
  document.documentElement.dataset.dshPlatform = platform
}

void new AppWebEntry(el).run()

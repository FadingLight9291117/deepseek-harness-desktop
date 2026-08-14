/**
 * Desktop protocol carrier. The browser half (src/client) provides
 * ctx.connection; this node half exports the pure `dsh://app` request→response
 * factory the Electron app wires into its `protocol.handle` registration, and
 * mounts as a loader row so the `dsh.client` roster scan picks up the browser
 * half (the standard fetch-arrival shape: node half = the app-facing factory
 * plus a no-op apply; the app owns the electron import, which a row module
 * could not resolve under Electron's realpath'd loader).
 *
 * The whole client — index with the injected boot manifest, plugin bundles,
 * vite assets, and `/api` — faces one protocol authority, so
 * `AbstractApiClient`'s same-origin base resolves unchanged. The two unbounded
 * event streams use the sandboxed preload bridge because Electron buffers
 * protocol responses to completion.
 * @module @deepseek-ai/dsh-client-connection-ipc
 */

import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { randomUuid } from '@deepseek-ai/dsh-client-connection-core'
import { injectBootManifest, type WebBootGraph } from '@deepseek-ai/dsh-client-modules'
import { RpcId, toFetchHandler, type ApiProxy } from '@deepseek-ai/dsh-host-apiproxy'

/** Stable Cordis plugin name. */
export const name = 'client-connection-ipc'

/** No required services — the factory receives its facts explicitly from the app. */
export const inject: string[] = []

const EMPTY_GRAPH: WebBootGraph = { rev: '', entries: [] }

/** Content types for the static asset route, keyed by extension. */
const ASSET_CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

/** Facts the app supplies from its booted host tree and assembly knowledge. */
export interface DesktopProtocolFacts {
  /** The in-process gateway the /api route dispatches through. */
  apiProxy: ApiProxy
  /** The module registry backing the /plugins bundle route (absent when the modules row is not mounted). */
  modules: { clientPath(id: string): string | undefined; graph(): WebBootGraph } | undefined
  /** Absolute directory containing the vite-built renderer (dist/). */
  distRoot: string
}

/** One plugin bundle route: `/plugins/<id>/client.js` and its source map, served from the module registry's resolved paths. */
async function pluginBundleResponse(pathname: string, modules: NonNullable<DesktopProtocolFacts['modules']>): Promise<Response | undefined> {
  const prefix = '/plugins/'
  const mapSuffix = '/client.js.map'
  const bundleSuffix = '/client.js'
  const isSourceMap = pathname.startsWith(prefix) && pathname.endsWith(mapSuffix)
  const suffix = isSourceMap ? mapSuffix : bundleSuffix
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) return undefined
  const clientPath = modules.clientPath(pathname.slice(prefix.length, -suffix.length))
  if (clientPath === undefined) return new Response('not found', { status: 404 })
  return readFile(`${clientPath}${isSourceMap ? '.map' : ''}`).then(
    body => new Response(body, {
      headers: {
        'content-type': isSourceMap ? 'application/json; charset=utf-8' : 'text/javascript; charset=utf-8',
        'cache-control': 'no-cache',
      },
    }),
    () => new Response('not found', { status: 404 }),
  )
}

/** One vite dist asset, rooted at the dist root with traversal refused. */
async function assetResponse(distRoot: string, pathname: string): Promise<Response> {
  const candidate = normalize(join(distRoot, pathname))
  if (!candidate.startsWith(distRoot + sep) && candidate !== distRoot) {
    return new Response('not found', { status: 404 })
  }
  return readFile(candidate).then(
    body => new Response(body, {
      headers: { 'content-type': ASSET_CONTENT_TYPES[extname(candidate)] ?? 'application/octet-stream' },
    }),
    () => new Response('not found', { status: 404 }),
  )
}

/**
 * Build the `dsh://app` request→response function. `/api/**` rides the
 * in-process gateway (unary POSTs plus the SSE event streams), `/plugins`
 * serves the module registry's bundles, `/index.html` serves the built
 * renderer with `window.__DSH_BOOT__` injected, and everything else serves
 * the vite dist assets.
 * @param facts - gateway, module registry, and dist root.
 * @returns the handler for Electron's `protocol.handle`.
 */
export function createDesktopProtocolHandler(facts: DesktopProtocolFacts): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url)
    if (url.host !== 'app') return new Response('not found', { status: 404 })
    const pathname = url.pathname

    if (pathname.startsWith('/api/')) {
      // Rebuild a fresh Request so the pure handler sees the standard
      // surface regardless of the runtime object's prototype chain. The
      // body arrives as a stream (a text round-trip covers every unary
      // call; GET SSE routes carry no body).
      const bodyText = request.body === null
        ? undefined
        : await new Response(request.body).text()
      const rebuilt = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        ...bodyText === undefined ? {} : { body: bodyText },
      })
      return toFetchHandler(facts.apiProxy).fetch(rebuilt)
    }

    if (facts.modules !== undefined && pathname.startsWith('/plugins/')) {
      const response = await pluginBundleResponse(pathname, facts.modules)
      if (response !== undefined) return response
    }

    if (pathname === '/' || pathname === '/index.html') {
      const html = await readFile(join(facts.distRoot, 'index.html'), 'utf8')
      return new Response(injectBootManifest(html, facts.modules?.graph() ?? EMPTY_GRAPH), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }

    return assetResponse(facts.distRoot, pathname)
  }
}

/**
 * Push-channel abstraction the app wires to `webContents.send`: the frame
 * stream pump needs no electron import, so the carrier stays testable.
 */
export interface StreamSender {
  /** Deliver one full-form ServerRequest (JSON-serializable) to the subscribed renderer. */
  send(channel: string, frame: unknown): void
}

/**
 * Pump one event stream over a push channel. The protocol handler cannot
 * stream an unbounded SSE body (Electron buffers protocol responses to
 * completion), so the live event streams ride IPC pushes while unary calls
 * and assets keep the fetch path.
 * @param apiProxy - the in-process gateway.
 * @param kind - which event stream to pump.
 * @param sender - the push target (one window's webContents).
 * @returns disposer that aborts the pump.
 */
export function createEventStreamPump(apiProxy: ApiProxy, kind: 'mux' | 'host', sender: StreamSender): () => void {
  const controller = new AbortController()
  const channel = `dsh:push:${kind}`
  const stream = kind === 'mux'
    ? apiProxy.events.mux({ rpcId: RpcId(randomUuid()), payload: {} }, controller.signal)
    : apiProxy.events.host({ rpcId: RpcId(randomUuid()), payload: {} }, controller.signal)
  void (async () => {
    try {
      for await (const narrow of stream) {
        if (controller.signal.aborted) return
        sender.send(channel, { type: 'server-request', rpcId: narrow.rpcId, method: narrow.payload.type, payload: narrow.payload })
      }
      if (!controller.signal.aborted) sendStreamFailure(sender, channel, `${kind} event stream ended`)
    } catch (error) {
      if (!controller.signal.aborted) sendStreamFailure(sender, channel, error)
    }
  })()
  return () => { controller.abort() }
}

/** Deliver the terminal frame that makes the renderer's connection controller reconnect. */
function sendStreamFailure(sender: StreamSender, channel: string, error: unknown): void {
  const payload = {
    type: 'stream/error' as const,
    error: { code: 'internal' as const, message: String(error), details: {} },
  }
  try {
    sender.send(channel, {
      type: 'server-request',
      rpcId: RpcId(randomUuid()),
      method: payload.type,
      payload,
    })
  } catch {
    // The renderer was destroyed while the source failed, so no receiver remains for the terminal frame.
  }
}

/** No-op host apply: the row exists so the roster scan mounts the browser half and the Loader governs its lifecycle. */
export function apply(_ctx: Context): void {}

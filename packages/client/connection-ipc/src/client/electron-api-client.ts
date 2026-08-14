/**
 * Desktop platform api subclass. Unary calls ride `globalThis.fetch` against
 * the `dsh://app` origin the protocol handler serves; the mux/host event
 * streams ride IPC push channels (Electron buffers protocol responses to
 * completion, so an unbounded SSE body can never stream through the
 * protocol — the push pumps live in the carrier's node half and arrive here
 * through the sandboxed preload bridge).
 */
import type {
  ApiProxy, HostFrame, MuxFrame, RpcRequest, ServerRequest,
} from '@deepseek-ai/dsh-host-apiproxy/api'
import { hostFrameSchema, muxFrameSchema } from '@deepseek-ai/dsh-host-apiproxy/api/events.schema'
import { serverRequestSchema } from '@deepseek-ai/dsh-host-apiproxy/api/rpc.schema'
import { AbstractApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'

declare global {
  interface Window {
    /** The sandboxed preload bridge (absent when the preload did not load). */
    dshDesktop?: {
      subscribeStream(stream: 'mux' | 'host', onFrame: (frame: unknown) => void): () => void
    }
  }
}

interface Parser<F> {
  parse(value: unknown): F
}

/** Fetch-based api client for the desktop protocol carrier, with IPC-pushed event streams. */
export class ElectronApiClient extends AbstractApiClient {
  protected doFetch(input: URL, init?: RequestInit): Promise<Response> {
    return globalThis.fetch(input, init)
  }

  protected override openMux(
    _payload: Parameters<ApiProxy['events']['mux']>[0]['payload'],
    signal: AbortSignal,
    onOpen?: () => void,
  ): AsyncIterable<RpcRequest<MuxFrame>> {
    return this.readPushStream('mux', muxFrameSchema, signal, onOpen)
  }

  protected override openHost(
    _payload: Parameters<ApiProxy['events']['host']>[0]['payload'],
    signal: AbortSignal,
    onOpen?: () => void,
  ): AsyncIterable<RpcRequest<HostFrame>> {
    return this.readPushStream('host', hostFrameSchema, signal, onOpen)
  }

  /**
   * Read one event stream from the preload bridge: subscribe, then yield
   * every validated full-form ServerRequest frame. The subscription returns
   * an unsubscribe that also ends the host-side pump; onOpen fires on
   * subscribe (the pump starts on demand).
   */
  private async *readPushStream<F extends MuxFrame | HostFrame>(
    stream: 'mux' | 'host',
    frameSchema: Parser<F>,
    signal: AbortSignal,
    onOpen?: () => void,
  ): AsyncGenerator<RpcRequest<F>> {
    const bridge = globalThis.window.dshDesktop
    if (bridge === undefined) {
      throw new Error('connection-ipc: preload bridge unavailable — the event streams cannot open')
    }
    const inbox: RpcRequest<F>[] = []
    let wake: (() => void) | undefined
    let closed = false
    const unsubscribe = bridge.subscribeStream(stream, (frame) => {
      if (closed) return
      let full: ServerRequest
      let parsed: F
      try {
        full = serverRequestSchema.parse(frame)
        parsed = frameSchema.parse(full.payload)
      } catch (error) {
        console.error(`[connection-ipc] dropping malformed push frame on ${stream}:`, error)
        return
      }
      this.onEnvelope(full)
      inbox.push({ rpcId: full.rpcId, payload: parsed })
      wake?.()
      wake = undefined
    })
    const close = (): void => {
      if (closed) return
      closed = true
      unsubscribe()
      wake?.()
      wake = undefined
    }
    const handleAbort = (): void => { close() }
    signal.addEventListener('abort', handleAbort, { once: true })
    try {
      if (signal.aborted) {
        close()
        return
      }
      onOpen?.()
      while (!closed) {
        const next = inbox.shift()
        if (next !== undefined) {
          yield next
          continue
        }
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally {
      signal.removeEventListener('abort', handleAbort)
      close()
    }
  }
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { ElectronApiClient } from '../src/client/electron-api-client.ts'

interface BridgeHarness {
  emit(frame: unknown): void
  subscribed: string[]
  unsubscribe: ReturnType<typeof vi.fn>
}

function installBridge(): BridgeHarness {
  let listener: ((frame: unknown) => void) | undefined
  const subscribed: string[] = []
  const unsubscribe = vi.fn()
  vi.stubGlobal('window', {
    dshDesktop: {
      platform: 'darwin',
      subscribeStream: (stream: string, onFrame: (frame: unknown) => void) => {
        subscribed.push(stream)
        listener = onFrame
        return unsubscribe
      },
    },
  })
  return {
    subscribed,
    unsubscribe,
    emit: (frame) => { listener?.(frame) },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ElectronApiClient push streams', () => {
  it('wakes a pending iterator and unsubscribes once when aborted', async () => {
    const bridge = installBridge()
    const abort = new AbortController()
    const opened = vi.fn()
    const iterator = new ElectronApiClient().events.host({}, abort.signal, opened)[Symbol.asyncIterator]()
    const pending = iterator.next()
    await vi.waitFor(() => { expect(bridge.subscribed).toEqual(['host']) })
    expect(opened).toHaveBeenCalledOnce()

    abort.abort()

    await expect(pending).resolves.toEqual({ done: true, value: undefined })
    expect(bridge.unsubscribe).toHaveBeenCalledOnce()
  })

  it('does not open an already-aborted stream and still releases its subscription', async () => {
    const bridge = installBridge()
    const abort = new AbortController()
    abort.abort()
    const opened = vi.fn()
    const iterator = new ElectronApiClient().events.mux({}, abort.signal, opened)[Symbol.asyncIterator]()

    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
    expect(opened).not.toHaveBeenCalled()
    expect(bridge.unsubscribe).toHaveBeenCalledOnce()
  })

  it('yields validated frames, ignores late frames, and reports malformed input', async () => {
    const bridge = installBridge()
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const abort = new AbortController()
    const client = new ElectronApiClient()
    const envelopes: unknown[] = []
    client.subscribeEnvelopes((batch) => { envelopes.push(...batch) })
    const iterator = client.events.host({}, abort.signal)[Symbol.asyncIterator]()
    const first = iterator.next()
    await vi.waitFor(() => { expect(bridge.subscribed).toEqual(['host']) })
    bridge.emit({ nope: true })
    bridge.emit({
      type: 'server-request',
      rpcId: RpcId('host-frame'),
      method: 'host/session-removed',
      payload: { type: 'host/session-removed', sessionId: SessionId('session-1') },
    })

    await expect(first).resolves.toEqual({
      done: false,
      value: { rpcId: 'host-frame', payload: { type: 'host/session-removed', sessionId: 'session-1' } },
    })
    expect(error).toHaveBeenCalledOnce()
    expect(envelopes).toHaveLength(1)

    const terminal = iterator.next()
    bridge.emit({
      type: 'server-request', rpcId: 'terminal', method: 'stream/error',
      payload: { type: 'stream/error', error: { code: 'internal', message: 'source failed', details: {} } },
    })
    await expect(terminal).resolves.toEqual({
      done: false,
      value: {
        rpcId: 'terminal',
        payload: { type: 'stream/error', error: { code: 'internal', message: 'source failed', details: {} } },
      },
    })
    expect(envelopes).toHaveLength(2)

    const pending = iterator.next()
    abort.abort()
    bridge.emit({
      type: 'server-request', rpcId: 'late', method: 'stream/error',
      payload: { type: 'stream/error', error: { code: 'internal', message: 'late', details: {} } },
    })
    await expect(pending).resolves.toEqual({ done: true, value: undefined })
  })

  it('fails loud when the preload bridge is unavailable', async () => {
    vi.stubGlobal('window', {})
    const iterator = new ElectronApiClient().events.host({}, new AbortController().signal)[Symbol.asyncIterator]()
    await expect(iterator.next()).rejects.toThrow('preload bridge unavailable')
  })
})

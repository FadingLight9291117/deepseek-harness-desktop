import { describe, expect, it, vi } from 'vitest'
import { RpcId, type ApiProxy, type HostFrame, type MuxFrame, type RpcRequest } from '@deepseek-ai/dsh-host-apiproxy'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { createEventStreamPump, type StreamSender } from '../src/index.ts'

type Frame = MuxFrame | HostFrame
type MuxRequest = Parameters<ApiProxy['events']['mux']>[0]
type HostRequest = Parameters<ApiProxy['events']['host']>[0]

function apiWith(source: (signal: AbortSignal) => AsyncIterable<RpcRequest<Frame>>): ApiProxy {
  return {
    events: {
      mux: (_request: MuxRequest, signal: AbortSignal) => source(signal) as AsyncIterable<RpcRequest<MuxFrame>>,
      host: (_request: HostRequest, signal: AbortSignal) => source(signal) as AsyncIterable<RpcRequest<HostFrame>>,
    },
  } as unknown as ApiProxy
}

describe('desktop event stream pump', () => {
  it.each(['mux', 'host'] as const)('forwards %s frames and reports a source failure', async (kind) => {
    const source = async function*(): AsyncGenerator<RpcRequest<Frame>> {
      yield kind === 'mux'
        ? { rpcId: RpcId('source-frame'), payload: { type: 'session/subscribed', sessionId: SessionId('session-1'), lastSeq: 0 } }
        : { rpcId: RpcId('source-frame'), payload: { type: 'host/session-removed', sessionId: SessionId('session-1') } }
      throw new Error('source failed')
    }
    const sent: { channel: string; frame: unknown }[] = []
    createEventStreamPump(apiWith(source), kind, {
      send: (channel, frame) => { sent.push({ channel, frame }) },
    })

    await vi.waitFor(() => { expect(sent).toHaveLength(2) })
    expect(sent[0]).toMatchObject({
      channel: `dsh:push:${kind}`,
      frame: { type: 'server-request', rpcId: 'source-frame' },
    })
    expect(sent[1]).toMatchObject({
      channel: `dsh:push:${kind}`,
      frame: {
        type: 'server-request',
        method: 'stream/error',
        payload: { type: 'stream/error', error: { code: 'internal', message: 'Error: source failed', details: {} } },
      },
    })
  })

  it('reports an unexpected clean source end', async () => {
    const sent: unknown[] = []
    createEventStreamPump(apiWith(async function*() {}), 'host', {
      send: (_channel, frame) => { sent.push(frame) },
    })

    await vi.waitFor(() => { expect(sent).toHaveLength(1) })
    expect(sent[0]).toMatchObject({
      method: 'stream/error',
      payload: { error: { message: 'host event stream ended' } },
    })
  })

  it('aborts its source without reporting an intentional disposal', async () => {
    let sourceSignal: AbortSignal | undefined
    const source = async function*(signal: AbortSignal): AsyncGenerator<RpcRequest<Frame>> {
      sourceSignal = signal
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
    }
    const send = vi.fn()
    const sender: StreamSender = { send }
    const dispose = createEventStreamPump(apiWith(source), 'mux', sender)
    await vi.waitFor(() => { expect(sourceSignal).toBeDefined() })

    dispose()

    expect(sourceSignal?.aborted).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(send).not.toHaveBeenCalled()
  })

  it('contains terminal delivery failure after the renderer disappears', async () => {
    const sender: StreamSender = { send: () => { throw new Error('renderer destroyed') } }
    createEventStreamPump(apiWith(async function*() {}), 'host', sender)
    await new Promise(resolve => setTimeout(resolve, 0))
  })
})

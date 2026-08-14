/**
 * The `ctx.connection` contract shared by every client transport: the api
 * client, loopback posture, host description source, generic RPC channels,
 * and the one-shot stream-controller starter.
 */
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import type { ClientConnectionRpc } from './rpc.ts'
import type { ConnectionConfig, ConnectionSinks, HostDescription } from './controller.ts'

/** Observable Host description published by each completed connection handshake. */
export interface HostDescriptionSource {
  /** Latest connected-generation description; absent before connect and while reconnecting. */
  getSnapshot(): HostDescription | undefined
  /** Subscribe to description replacement and connection loss. */
  subscribe(listener: () => void): () => void
}

/**
 * The ctx.connection service API: the API client plus a one-shot
 * controller starter (the runtime plugin supplies sinks when its object layer
 * is ready — the connection stays consumer-agnostic).
 */
export interface ConnectionHandle {
  /** Shared api client (transport-specific implementation, decided by the providing plugin). */
  readonly api: IApiClient
  /** Whether the current page authority is loopback; non-browser contexts default to true. */
  readonly isLoopback: boolean
  /** Generation-scoped Host facts, including native path-open capability. */
  readonly hostDescription: HostDescriptionSource
  /** Generic logical RPC channels over the same Connection transport. */
  readonly rpc: ClientConnectionRpc
  /**
   * Start the connect/pump/reconnect loop with the consumer's frame sinks.
   * One consumer owns the streams (the runtime object layer); a second call
   * throws.
   * @param sinks - frame/state callbacks.
   * @param config - reconnect/backoff tunables.
   * @returns stop handle for the loop.
   */
  start(sinks: ConnectionSinks, config?: ConnectionConfig): { stop(): void }
}

/**
 * Build the generation-scoped description source: publishes each connected
 * generation's Host description, retracting on reconnect.
 * @returns the source plus its publish function.
 */
export function createHostDescriptionSource(): { source: HostDescriptionSource; publish(next: HostDescription | undefined): void } {
  let description: HostDescription | undefined
  const descriptionListeners = new Set<() => void>()
  const publish = (next: HostDescription | undefined): void => {
    if (Object.is(description, next)) return
    description = next
    for (const listener of [...descriptionListeners]) {
      try {
        listener()
      } catch (error) {
        console.error('[web-runtime] host-description listener threw:', error)
      }
    }
  }
  return {
    source: {
      getSnapshot: () => description,
      subscribe: (listener) => {
        descriptionListeners.add(listener)
        return () => { descriptionListeners.delete(listener) }
      },
    },
    publish,
  }
}

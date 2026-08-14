/**
 * Desktop wire client: provides ctx.connection over the ElectronApiClient.
 * The controller, RPC caller, and handle contract are the shared
 * transport-agnostic core; this plugin owns only the desktop transport
 * choice. The page faces one local protocol authority, so the loopback
 * posture is unconditionally true.
 */
import type { Context } from '@deepseek-ai/cordis'
import {
  ConnectionController,
  createConnectionRpc,
  createHostDescriptionSource,
  type ConnectionHandle,
} from '@deepseek-ai/dsh-client-connection-core'
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import { ElectronApiClient } from './electron-api-client.ts'

export { ElectronApiClient } from './electron-api-client.ts'
export type {
  ClientConnectionRpc,
  ConnectionConfig,
  ConnectionHandle,
  ConnectionSinks,
  HostDescriptionSource,
} from '@deepseek-ai/dsh-client-connection-core'

/** Required services (none — this is the wire root). */
export const inject: string[] = []

/**
 * Client plugin body: provide ctx.connection with the protocol api client.
 * @param ctx - client cordis context.
 */
export function apply(ctx: Context): void {
  const api: IApiClient = new ElectronApiClient()
  const rpc = createConnectionRpc()
  const hostDescriptionState = createHostDescriptionSource()
  const hostDescription = hostDescriptionState.source
  let started = false
  const handle: ConnectionHandle = {
    api,
    isLoopback: true,
    hostDescription,
    rpc,
    start(sinks, config) {
      if (started) throw new Error('connection-ipc: the stream loop is already owned by another consumer')
      started = true
      const controller = new ConnectionController(api, {
        ...sinks,
        onConnected: (next) => {
          hostDescriptionState.publish(next)
          // A description subscriber may synchronously stop the loop. In that
          // case publish(undefined) has already retracted this generation, so
          // do not leak its stale connected notification to the consumer sink
          // afterward.
          if (!Object.is(hostDescription.getSnapshot(), next)) return
          sinks.onConnected?.(next)
        },
        onStateChange: (state) => {
          if (state === 'reconnecting') hostDescriptionState.publish(undefined)
          sinks.onStateChange?.(state)
        },
      }, config ?? {})
      controller.start()
      return {
        stop: () => {
          controller.stop()
          hostDescriptionState.publish(undefined)
        },
      }
    },
  }
  ctx.provide('connection', handle)
}

/**
 * Transport-agnostic connection core: the controller, the RPC caller, and
 * the `ctx.connection` contract. Every client transport plugin (the browser
 * HTTP carrier, the desktop protocol carrier) consumes this library and
 * supplies only its api subclass — no provider forks the pump.
 * @module @deepseek-ai/dsh-client-connection-core
 */

export {
  ConnectionController,
  type ConnectionConfig,
  type ConnectionSinks,
  type ConnectionState,
  type HostDescription,
} from './controller.ts'
export {
  createConnectionRpc,
  type ClientConnectionRpc,
} from './rpc.ts'
export {
  createHostDescriptionSource,
  type ConnectionHandle,
  type HostDescriptionSource,
} from './handle.ts'
export { randomUuid } from './random-uuid.ts'

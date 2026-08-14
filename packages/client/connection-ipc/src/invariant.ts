/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-connection-ipc`.
 * @module @deepseek-ai/dsh-client-connection-ipc/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-connection-ipc'

/** Cordis companion plugin name. */
export const name = 'client-connection-ipc-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the wire layer emits no cordis events and owns no
 * mutable cross-plugin relation — stream/reconnect sequencing is exercised
 * by the connection core's behavior specs (which this transport reuses
 * unchanged), and the protocol route's register/unhandle symmetry is
 * exercised by the desktop carrier e2e.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */

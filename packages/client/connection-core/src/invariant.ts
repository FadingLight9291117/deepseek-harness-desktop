/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-connection-core`.
 * @module @deepseek-ai/dsh-client-connection-core/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-connection-core'

/** Cordis companion plugin name. */
export const name = 'client-connection-core-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a zero-dependency transport library with no cordis
 * services or events of its own — the transport plugins that consume it own
 * the runtime behavior and its invariants. Controller/handshake sequencing
 * is asserted directly by this package's behavior specs.
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

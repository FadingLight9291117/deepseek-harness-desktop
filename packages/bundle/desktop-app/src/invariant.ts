/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-desktop-app`.
 * @module @deepseek-ai/dsh-desktop-app/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-desktop-app'

/** Cordis companion plugin name. */
export const name = 'desktop-app-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the bundle glue republishes one assembly fact and
 * registers one prompt section; both relationships are asserted by the
 * desktop composition's own spec (the built-bin smoke boots this bundle and
 * the carrier e2e exercises the protocol it enables).
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

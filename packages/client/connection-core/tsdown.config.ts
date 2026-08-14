import { clientLibrary } from '../tsdown.client.ts'

/**
 * Client-only pure library: emitted during the Client pass (the Host pass
 * skips it via the shared preset's empty-entry config), so the browser
 * bundles that inline it always see a fresh artifact.
 */
export default clientLibrary('@deepseek-ai/dsh-client-connection-core', ['lib/types/index.js', 'lib/types/invariant.js'])

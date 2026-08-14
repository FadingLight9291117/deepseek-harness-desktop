import { clientBundle } from '../tsdown.client.ts'

/**
 * The node half (the pure protocol-handler factory + event-stream pump) must
 * ship during the Host pass: the desktop app consumes it from the same pass.
 * hostPhase emits the node configs there and only the browser bundle during
 * the Client pass — the api-remotes split precedent.
 */
export default clientBundle('@deepseek-ai/dsh-client-connection-ipc', ['lib/types/index.js', 'lib/types/invariant.js'], {
  hostPhase: true,
})

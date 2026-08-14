# @deepseek-ai/dsh-client-connection-ipc

English | [中文](README.zh.md)

The desktop protocol carrier, the zero-port stand-in for the webserver. The node half exports the pure `dsh://app` request→response factory (the Electron app wires it into `protocol.handle` — this package never imports electron): `/api/**` rides the same in-process `toFetchHandler(apiProxy)` the browser carrier mounts, `/plugins/<id>/client.js[.map]` serves the module registry's resolved bundles, `/index.html` serves the built renderer with `window.__DSH_BOOT__` injected (`injectBootManifest`), and everything else serves the vite dist assets. The browser half provides `ctx.connection` over the `ElectronApiClient` — a pure `globalThis.fetch` subclass for unary calls; the mux/host event streams ride IPC push channels (`createEventStreamPump` → sandboxed preload bridge → the client's `openMux`/`openHost` overrides), because Electron buffers protocol responses and an unbounded SSE body cannot stream through `dsh://`. Under plain Node (the built-bin smoke) no protocol exists and nothing registers. The page faces one local protocol authority, so the loopback posture is unconditionally true and there is no Host trust fence: the only client is the app's own renderer.

Each stream pump forwards source failures and unexpected completion as a terminal `stream/error` frame. The renderer yields that frame so `ConnectionController` observes the lost transport and reconnects. Aborting or replacing a generation unsubscribes and wakes its pending iterator immediately; intentional abort is local termination and does not emit a remote error.

## Model Experience

Indirectly, through the transport plugins that consume it: the carrier moves already-composed wire envelopes between the renderer and the in-process gateway, and nothing here adds, filters, or rewrites anything that reaches a model request.

#### KV Cache effect

None: this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Unary bodies are buffered per call** — the request body round-trips as text; the image-limit-sized bodies the browser bridge bounds also bound this path.
- **No Host trust fence** — deliberate: the protocol authority is unreachable outside the app process; a hypothetical multi-window multi-origin desktop would need one.
- **The generic RPC channels (`dynamicCordisRunner` and friends) have no desktop dispatch** — the protocol routes only the unary methods table; the Cordis runner UI degrades (404) until the carrier mounts the HostConnectionRpc channel registry.

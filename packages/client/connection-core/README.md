# @deepseek-ai/dsh-client-connection-core

English | [中文](README.zh.md)

Transport-agnostic connection core, consumed by every client transport plugin (the browser HTTP carrier and the desktop protocol carrier): the `ConnectionController` pump (both downstream streams, strict readiness handshake with `host.describe`, exponential-backoff reconnect, sink isolation), the fetch-backed `createConnectionRpc` caller, the `ConnectionHandle`/`HostDescriptionSource` contract, and `createHostDescriptionSource`. One implementation for every carrier — a transport plugin supplies only its api subclass and its loopback posture; the pump, handshake, and reconnection are never forked.

## Model Experience

Indirectly, through the transport plugins that consume it: the controller and RPC caller move already-composed wire envelopes between the api client and business sinks, and nothing here adds, filters, or rewrites anything that reaches a model request.

#### KV Cache effect

None: this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- Reconnection is unconditional on any generation loss; there is no carrier-specific policy hook (a transport that cannot meaningfully reconnect may still prefer the shared loop for its handshake semantics).

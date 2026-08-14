# @deepseek-ai/dsh-host-directory-picker-electron

English | [中文](README.zh.md)

Electron Service Provider for the [directory-picker capability seam](../directory-picker/README.md). `ElectronDirectoryPicker` registers the stable `{ kind: 'native', pick(signal) }` capability on `ctx.directoryPicker` and delegates each selection to the app-owned `ctx.electronDirectoryPickerRuntime`. The desktop main process supplies that runtime around Electron's `dialog.showOpenDialog`; this package imports no Electron code, so unit tests and plain-Node profile validation need no GUI binary. Selected paths cross unchanged, including Windows drive and UNC paths. The desktop bundle separately mounts the transport-independent [`dsh-client-ui-directory-picker-native`](../../client/ui-directory-picker-native/README.md) flow.

The provider can load without the app runtime so the built desktop entry can perform its plain-Node headless smoke. Calling `pick` in that mode fails with an explicit unavailable error; a real window boot provides the runtime before Cordis loads the profile.

## Model Experience

None, as this provider serves the GUI host's directory selection; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- Electron does not expose an API for programmatically closing an already-visible `showOpenDialog` panel. Caller abort settles the request immediately and ignores the eventual result; the native panel remains until the operator dismisses it or its parent window closes.

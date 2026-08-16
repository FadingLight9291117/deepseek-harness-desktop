/**
 * Sandboxed preload: the minimal bridge the connection-ipc client half
 * consumes for the live event streams. Unary calls and assets ride the
 * dsh:// protocol fetch path; only the unbounded SSE streams need IPC.
 * CJS because a sandboxed preload has no ESM loader — require('electron')
 * is the one import a sandboxed preload may make.
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  /**
   * Subscribe to one host event stream (mux or host) as pushed frames.
   * @param {string} stream - 'mux' | 'host'.
   * @param {(frame: unknown) => void} onFrame - receives each full-form ServerRequest.
   * @returns {() => void} unsubscribe.
   */
  subscribeStream(stream, onFrame) {
    const channel = `dsh:push:${stream}`
    const listener = (_event, frame) => { onFrame(frame) }
    ipcRenderer.on(channel, listener)
    ipcRenderer.send('dsh:subscribe', stream)
    return () => {
      ipcRenderer.removeListener(channel, listener)
      ipcRenderer.send('dsh:unsubscribe', stream)
    }
  },
})

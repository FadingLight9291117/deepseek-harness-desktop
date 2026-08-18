#!/usr/bin/env node
/**
 * dsh CLI forwarder: the @deepseek-ai/dsh dependency owns the real bin; this
 * shim re-exports it so `npm install -g deepseek-desktop` exposes `dsh` on
 * PATH (npm links only the top-level package's bins, not dependencies').
 * The real bin is ESM, so it is loaded dynamically.
 */
'use strict'
const { join } = require('node:path')
const realBin = require.resolve('@deepseek-ai/dsh/lib/bin.js', { paths: [join(__dirname, '..')] })
;(async () => {
  await import(require('node:url').pathToFileURL(realBin).href)
})().catch((error) => {
  console.error(`dsh: failed to start: ${error.message}`)
  process.exit(1)
})

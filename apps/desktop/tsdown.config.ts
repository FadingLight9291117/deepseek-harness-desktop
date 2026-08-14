import { defineConfig } from 'tsdown'

/**
 * Two runtime entries, both Host-pass artifacts: the Electron main process,
 * flattened to `lib/index.js` (the package.json `main`) like apps/cli's
 * `lib/bin.js` — the root tsdown builds only `lib/types/index.js`, so this
 * override points at the `main/` directory's index instead. And the
 * sandboxed preload as `lib/preload/index.cjs` (CJS — a sandboxed preload
 * has no ESM loader). The Client pass skips this app: it emits nothing the
 * client pass consumes (the renderer is a vite build), and building there
 * would race the connection-ipc node half's Client-pass rebuild.
 */
export default defineConfig(({ env }) => {
  if (env?.DSH_BUILD_FACE === 'client') return { entry: '' }
  return [{
    entry: ['lib/types/main/index.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    deps: {
      // electron must stay a native dynamic import: bundled, its CJS index.js
      // (which reads `__dirname` to locate the binary) runs in ESM scope and
      // throws. External, the same `import('electron')` resolves the built-in
      // under Electron and the path-string shim under plain Node.
      neverBundle: [/^electron$/],
      // Everything else bundles into lib/index.js. Electron's ESM loader
      // realpaths pnpm symlinks, so an externalized app-boot/loader resolves to
      // vendor/loader's physical directory, whose own dynamic imports of row
      // packages then miss this app's node_modules. Inlined, the loader's code
      // runs from apps/desktop/lib and resolves entries from this app's own
      // dependency closure — profile rows still resolve from the profile's
      // healed node_modules fallback unchanged.
      alwaysBundle: [/^@deepseek-ai\//],
    },
  },
  {
    entry: { 'preload/index': 'src/preload/index.cjs' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    // require('electron') is the one import a sandboxed preload may make.
    deps: { neverBundle: [/^electron$/] },
  }]
})

import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from './vitest.shared.ts'

// Desktop Electron lane: launches the real built app through Playwright's
// _electron driver and exercises the dsh:// protocol carrier end to end —
// boot-manifest injection, unary RPC through the in-process gateway, SSE
// event delivery through preload-mediated IPC push channels, and the settled
// web UI. Requires a display (macOS CI lane); the generic e2e config includes
// only the built-bin smoke for windowless hosts.
try {
  // Node >= 21.7 native; throws when the file does not exist.
  process.loadEnvFile(new URL('.env', import.meta.url).pathname)
} catch {
  // No .env — fine, the environment may already carry the variables.
}

export default defineConfig({
  // Same resolution note as vitest.config.ts: the tsconfig.base.json paths
  // facade has no include (match-all), so the suite resolves bare workspace
  // imports to source like every other lane.
  plugins: [
    tsconfigPaths({ projects: ['./tsconfig.base.json'] }),
    standardDecoratorPlugin(),
  ],
  test: {
    execArgv: vitestExecArgv,
    include: ['apps/desktop/tests/**/*.e2e.ts'],
    // Electron boot + UI settle are slow; one file, serial.
    testTimeout: 180_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
})

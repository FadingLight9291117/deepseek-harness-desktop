/** macOS launcher for the installed DeepSeek Desktop application. @module @deepseek-ai/dsh/desktop */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const APP_NAME = 'DeepSeek.app'

/**
 * Open the app installed by `pnpm run package:desktop -- --install`.
 * @throws when this is not macOS, the app is absent, or macOS rejects the handoff.
 */
export function runDesktop(): void {
  if (process.platform !== 'darwin') {
    throw new Error('dsh desktop is available only on macOS')
  }
  const app = join(homedir(), 'Applications', APP_NAME)
  if (!existsSync(app)) {
    throw new Error(`dsh desktop could not find ${app}; install it with pnpm run package:desktop -- --install`)
  }
  const result = spawnSync('open', [app], { stdio: 'ignore' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`dsh desktop could not open ${app} (exit ${String(result.status)})`)
}

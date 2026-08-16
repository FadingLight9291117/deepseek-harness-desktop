/**
 * Real-composition guard for the native theme sync: the desktop runtime
 * plugin boots from a test-only cordis.yml through the actual Loader +
 * Include path with the real settings-file provider and the real ui-theme
 * host entry, applies the persisted theme preference at activation, follows
 * live settings commits, and no-ops when the app's desktopThemeSync service
 * is absent (the headless boot provides neither it nor desktopApp's theme).
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import * as uiTheme from '@deepseek-ai/dsh-client-ui-theme'
import DesktopRuntimeProvider from '../src/index.ts'

/** Preferences the recorder observed, in order. */
interface SyncState {
  calls: string[]
}

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function loadComposition(
  options?: { withSync?: boolean },
): Promise<{ ctx: Context; state: SyncState }> {
  const withSync = options?.withSync ?? true
  root = await mkdtemp(join(tmpdir(), 'dsh-desktop-app-theme-'))
  const rootDir = root
  const settingsPath = join(rootDir, 'settings.yaml')
  await writeFile(settingsPath, 'ui-theme:\n  preference: dark\n')

  const state: SyncState = { calls: [] }
  // Test-only assembly facts: the desktopApp assembly the plugin injects, and
  // the desktopThemeSync recorder standing in for the app's Electron seam.
  const facts = {
    name: 'test-desktop-facts',
    apply: (ctx: Context) => {
      ctx.provide('desktopApp', { distRoot: join(rootDir, 'dist') })
      if (withSync) {
        ctx.provide('desktopThemeSync', {
          setThemePreference: (preference: string) => { state.calls.push(preference) },
        })
      }
    },
  }

  // One include per layer, mirroring the shipped profile's bundle order
  // (base mounts the settings provider, web-app the ui-theme row, desktop-app
  // this plugin): each layer settles before the next mounts, so the theme
  // namespace is registered and published before the plugin activates.
  const layers = [
    [
      '- id: settings',
      "  name: '@deepseek-ai/dsh-settings-file'",
      '  config:',
      `    path: ${JSON.stringify(settingsPath)}`,
      '    debounceMs: 10',
      '',
    ],
    [
      '- id: ui-theme',
      "  name: '@deepseek-ai/dsh-client-ui-theme'",
      '',
    ],
    [
      '- id: desktop-facts',
      '  name: test-desktop-facts',
      '- id: desktop-runtime',
      "  name: '@deepseek-ai/dsh-desktop-app'",
      '',
    ],
  ].map(lines => lines.join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-settings-file', FileSettingsProvider],
    ['@deepseek-ai/dsh-client-ui-theme', uiTheme],
    ['test-desktop-facts', facts],
    ['@deepseek-ai/dsh-desktop-app', DesktopRuntimeProvider],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  for (const [index, layer] of layers.entries()) {
    const layerPath = join(rootDir, `layer-${index}.yml`)
    await writeFile(layerPath, layer)
    await ctx.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(layerPath).href },
    })
  }
  await ctx.loader.await()
  return { ctx, state }
}

describe('desktop-app theme sync real composition', () => {
  it('applies the persisted preference at activation before any commit', async () => {
    const { state } = await loadComposition()
    expect(state.calls).toEqual(['dark'])
  })

  it('follows live settings commits through settings/updated', async () => {
    const { ctx, state } = await loadComposition()
    await ctx.get('settings')!.update(settingsNamespace('ui-theme'), { preference: 'light' })
    await vi.waitFor(() => {
      expect(state.calls.at(-1)).toBe('light')
    })
  })

  it('boots without the desktopThemeSync service and still serves desktopRuntime', async () => {
    const { ctx, state } = await loadComposition({ withSync: false })
    expect(state.calls).toEqual([])
    expect(ctx.get('desktopRuntime')).toMatchObject({ distRoot: expect.any(String) })
  })
})

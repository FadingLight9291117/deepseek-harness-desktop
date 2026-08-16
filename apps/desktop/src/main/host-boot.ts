/**
 * Desktop host boot: resolve the web profile, stack its patch layers (bundle
 * layers in `dsh.profile.bundles` order, the profile's own `cordis.patch.yml`,
 * the home-level layer, `--patch` overlays, the telemetry switch), mount the
 * tree over the profile's empty root config, keep the profile patch layer
 * live, and wire fail-loud plus bounded shutdown.
 *
 * The desktop shares the CLI's profile home: same `DSH_HOME`, same profile
 * templates, same patch filenames, so a person's `web` profile composes
 * identically in the window and in the browser surface. Assembly is
 * app-owned by design — this module is the desktop counterpart of
 * `apps/cli/src/profile-boot.ts`, not a shared package.
 * @module @deepseek-ai/dsh-desktop/main/host-boot
 */

import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FiberState, type Context } from '@deepseek-ai/cordis'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import {
  boot,
  composeEntries,
  healProfilesModuleFallback,
  installFailLoud,
  loadLayeredEnv,
  loadOptionalPatches,
  loadOverlayPatches,
  loadProfile,
  PROFILE_PATCH_FILENAME,
  watchUserPatches,
  type Profile,
} from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-desktop-app'
import type {} from '@deepseek-ai/dsh-host-apiproxy'
import type {} from '@deepseek-ai/dsh-host-directory-picker-electron'
import type { DesktopNativeRuntime } from './native.ts'
import { createProcessShutdown, type ProcessShutdown } from './process-shutdown.ts'

const NAME = 'dsh'

/** Package root selected across the nested source main/ and flattened built lib/ layouts. */
const BUILT_PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))
const PACKAGE_ROOT = existsSync(join(BUILT_PACKAGE_ROOT, 'package.json'))
  ? BUILT_PACKAGE_ROOT
  : fileURLToPath(new URL('../../', import.meta.url))

/** Shipped agent-preset root beside this app's own config. */
const SHIPPED_PRESET_ROOT = join(PACKAGE_ROOT, 'config/agent-presets')

/** Absolute path of this desktop installation's package.json. */
const INSTALL_ANCHOR = join(PACKAGE_ROOT, 'package.json')

/**
 * Absolute path of the built renderer dist root. Anchored at the package
 * root because tsdown flattens `src/main/index.ts` to `lib/index.js`, so a
 * module-relative hop differs between the source and built layouts; the
 * package.json anchor keeps the same hop in both.
 * @returns the vite-built dist/ directory path.
 */
export function rendererDistRoot(): string {
  return join(dirname(INSTALL_ANCHOR), 'dist')
}

/** The session-telemetry row id the DSH_TELEMETRY_DISABLED switch targets. */
const TELEMETRY_ROW_ID = 'session-telemetry-otel'

/** The empty root entry list every profile tree patches over. */
const PROFILE_ROOT_CONFIG = `# dsh profile root — an empty entry list. The tree is composed as patches:
# each bundle in package.json's dsh.profile.bundles, then cordis.patch.yml, then any
# --patch overlays. Edit cordis.patch.yml, not this file.
[]
`

/** Root config filename inside a profile directory. */
const PROFILE_ROOT_FILENAME = 'cordis.yml'

/**
 * The home-level user patch layer (`$DSH_HOME/cordis.patch.yml`), applied
 * over every profile's own layer. Resolved per call, not at module load:
 * `$DSH_HOME` may be set by the test or launcher after import.
 * @returns the absolute patch-file path.
 */
function homePatchPath(): string {
  return join(resolveDshHome(), PROFILE_PATCH_FILENAME)
}

/**
 * Resolve the telemetry opt-out switch into its boot patch. ANY non-empty
 * value (including `'0'`/`'false'`) disables: a privacy switch prefers
 * off-by-mistake over on-by-mistake. A composition without the telemetry row
 * exports nothing, so the switch is then trivially satisfied and no patch is
 * generated — custom profiles need not mount telemetry to run with the
 * switch set.
 * @param disabledEnv - the raw `DSH_TELEMETRY_DISABLED` value (`undefined` when unset).
 * @param hasRow - whether the composition carries the telemetry row.
 * @returns the disable patch, or `undefined` when no hard-disable patch is required.
 */
function resolveTelemetryPatch(disabledEnv: string | undefined, hasRow: boolean): PatchOptions | undefined {
  if ((disabledEnv ?? '') === '' || !hasRow) return undefined
  return { id: TELEMETRY_ROW_ID, disabled: true }
}

/**
 * Load a resolved profile for `name`: heal the shared module fallback, then
 * (re)write the empty root config. The root is always rewritten: the whole
 * composition is patch layers, and the vendored Loader's tree write-back (a
 * plugin self-disposing persists the current tree) can bake composed rows
 * into this file — which would duplicate every bundle insert on the next
 * boot. The file exists on disk only because the Loader needs a real include
 * root to anchor `baseUrl` at the profile directory.
 * @param name - the profile name.
 * @returns the loaded profile.
 */
function prepareProfile(name: string): Profile {
  healProfilesModuleFallback(INSTALL_ANCHOR)
  const profile = loadProfile(NAME, name, INSTALL_ANCHOR, undefined, { userLayer: true })
  writeFileSync(join(profile.dir, PROFILE_ROOT_FILENAME), PROFILE_ROOT_CONFIG)
  return profile
}

/** One profile's patch layers (application order) and the row index of its pre-flag composition. */
interface ComposedProfile {
  profile: Profile
  /** Bundle layers concatenated — the part below the user layers on a live reload. */
  bundlePatches: PatchOptions[]
  /** The home-level user layer (`$DSH_HOME/cordis.patch.yml`), applied after the profile's own. */
  homePatches: PatchOptions[]
  /** Layers above the user layers on a live reload: `--patch` overlays and the telemetry switch. */
  overlays: PatchOptions[]
  /** id → row of the composed tree (bundles + user layers + overlays), for the launcher's own row checks. */
  rows: ReadonlyMap<string, EntryOptions>
}

/** The full patch stack of one composed profile, in application order. */
function allPatches(composed: ComposedProfile): PatchOptions[] {
  return [
    ...composed.bundlePatches,
    ...composed.profile.patches,
    ...composed.homePatches,
    ...composed.overlays,
  ]
}

/**
 * Load `name` and compose its effective patch stack: bundle layers in
 * `dsh.profile.bundles` order, the profile's user layer, the home-level user
 * layer, `--patch` overlays, then the telemetry switch.
 * @param name - the profile name.
 * @param patchFiles - `--patch` overlay paths, in argv order.
 * @returns the profile, its patch layers, and the composed row index.
 */
function composeProfile(name: string, patchFiles: readonly string[]): ComposedProfile {
  const profile = prepareProfile(name)
  const homePatches = loadOptionalPatches(NAME, homePatchPath()) ?? []
  const overlays = patchFiles.flatMap(file => loadOverlayPatches(NAME, resolve(file)))
  const bundlePatches = profile.layers.flatMap(layer => layer.patches)
  const rows = new Map<string, EntryOptions>()
  for (const row of composeEntries([bundlePatches, profile.patches, homePatches, overlays])) {
    if (typeof row.id === 'string') rows.set(row.id, row)
  }
  const composedOverlays = [...overlays]
  // The SHIPPED root is the part of the roster only this app can resolve: it
  // sits beside this app's own config, in both the source and built layouts.
  // The writable root the roster appends is `dsh-agent-presets`' own, so a
  // launcher that never reaches this patch still finds a person's presets.
  if (rows.has('agent-presets')) {
    composedOverlays.push({
      id: 'agent-presets',
      config: {
        ...(rows.get('agent-presets')?.config ?? {}) as Record<string, unknown>,
        roots: [{ path: SHIPPED_PRESET_ROOT, trust: 'system' }],
      },
    })
  }
  const telemetryPatch = resolveTelemetryPatch(process.env.DSH_TELEMETRY_DISABLED, rows.has(TELEMETRY_ROW_ID))
  if (telemetryPatch !== undefined) composedOverlays.push(telemetryPatch)
  return { profile, bundlePatches, homePatches, overlays: composedOverlays, rows }
}

/** Options for {@link bootDesktopHost}. */
export interface BootDesktopHostOptions {
  /** The profile name to boot (the `web` profile today). */
  profile: string
  /** `--patch` overlay paths, in argv order. */
  patchFiles: readonly string[]
  /** The invocation's inner arguments, handed to the tree through `ctx.cmdlineArgs`. */
  args: readonly string[]
  /** Electron-native operations; absent only in the plain-Node headless smoke. */
  native?: DesktopNativeRuntime
}

/**
 * Re-throw a watcher-setup failure unless a shutdown already owns the tree.
 * @param ctx - the booted root context.
 * @param signal - this invocation's signal-shutdown fact.
 * @param error - the setup failure.
 */
function suppressShutdownError(ctx: Context, signal: AbortSignal, error: unknown): void {
  if (signal.aborted) return
  if (ctx.fiber.state !== FiberState.ACTIVE || ctx.get('loader') === undefined) return
  throw error
}

/**
 * Boot one desktop invocation end to end and leave process lifetime to the
 * mounted plugins and the Electron lifecycle in main/index.ts. Prints the
 * `dsh desktop: host ready` marker once the loader settles — the headless
 * smoke's readiness signal.
 * @param options - profile name, overlays, and the booted app's own arguments.
 * @returns the settled root context, the shutdown controller, and the
 * connection RPC service (the app composes the protocol carrier's /api
 * handler from it once the gateway service exists).
 */
export async function bootDesktopHost(options: BootDesktopHostOptions): Promise<{
  ctx: Context
  shutdown: ProcessShutdown
  connection: HostConnectionService
}> {
  const composed = composeProfile(options.profile, options.patchFiles)
  const app: { current?: Context } = {}
  const shutdown = createProcessShutdown(async () => { await app.current?.fiber.dispose() })
  let connection: HostConnectionService | undefined
  const signalShutdown = new AbortController()
  const interrupt = (code: number): void => {
    signalShutdown.abort()
    shutdown.interrupt(code)
  }
  process.on('SIGTERM', () => { interrupt(0) })
  process.on('SIGINT', () => { interrupt(130) })
  installFailLoud(NAME, process, async () => {
    await app.current?.fiber.dispose()
  })

  const rootConfig = join(composed.profile.dir, PROFILE_ROOT_FILENAME)
  const composeLive = (): PatchOptions[] => structuredClone([
    ...composed.bundlePatches,
    ...loadOptionalPatches(NAME, composed.profile.patchPath) ?? [],
    ...loadOptionalPatches(NAME, homePatchPath()) ?? [],
    ...composed.overlays,
  ])
  const ctx = await boot(NAME, rootConfig, structuredClone(allPatches(composed)), (hostCtx) => {
    app.current = hostCtx
    hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, loadLayeredEnv(NAME))
    // The web transport's connection row provides this service and mounts
    // its shared /api handler on the webserver. The desktop has no
    // webserver, so the app provides the service at the same root and the
    // protocol carrier mounts its shared handler instead: the typert
    // gateway row (base bundle) registers its /api interceptor on this
    // service, which routes the typert remote endpoints (slash commands,
    // the Cordis panels) the bare gateway handler does not serve. An empty
    // trust list is complete — the dsh:// page is the app's own renderer.
    connection = new HostConnectionService(hostCtx, [])
    // Assembly facts only this app can resolve: where its own renderer was
    // built. The desktop-app bundle republishes these as desktopRuntime for
    // the protocol carrier.
    hostCtx.provide('desktopApp', { distRoot: rendererDistRoot() })
    if (options.native !== undefined) {
      hostCtx.provide('nativePathRuntime', options.native.path)
      hostCtx.provide('electronDirectoryPickerRuntime', options.native.directoryPicker)
      hostCtx.provide('desktopThemeSync', options.native.theme)
    }
    provideCmdline(hostCtx, {
      args: options.args,
      exit: code => void shutdown.shutdown(code),
    })
  })
  app.current = ctx
  // The config-only HMR watcher needs the loader's internal module contract,
  // which only a Node process started with --expose-internals exposes —
  // Electron cannot pass it, and the plain-node smoke starts without it.
  // Both surfaces therefore boot without the live patch watcher (restart to
  // apply profile edits) and say so once.
  const electronVersion: unknown = Reflect.get(process.versions, 'electron')
  const loaderInternal: unknown = Reflect.get(ctx.loader, 'internal')
  if (electronVersion !== undefined || loaderInternal === undefined) {
    process.stderr.write('dsh desktop: config hot-reload unavailable (loader internals not exposed in this runtime); restart to apply profile patches\n')
  } else if (!signalShutdown.signal.aborted
    && ctx.fiber.state === FiberState.ACTIVE
    && ctx.get('loader') !== undefined) {
    try {
      if (ctx.get('hmr') === undefined) {
        if (ctx.get('timer') === undefined) {
          await ctx.loader.create({ name: '@deepseek-ai/cordis-plugin-timer' })
        }
        await ctx.loader.create({ name: '@deepseek-ai/cordis-plugin-hmr', config: { root: [] } })
      }
      await watchUserPatches(ctx, {
        binName: NAME,
        filename: composed.profile.patchPath,
        compose: composeLive,
      })
      await watchUserPatches(ctx, {
        binName: NAME,
        filename: homePatchPath(),
        compose: composeLive,
      })
    } catch (error) {
      suppressShutdownError(ctx, signalShutdown.signal, error)
    }
  }
  await ctx.loader.await()
  process.stdout.write('dsh desktop: host ready\n')
  // The setup callback above always runs inside boot(); fail loud rather
  // than let a future refactor return a boot without the /api dispatcher.
  if (connection === undefined) throw new Error('desktop host boot did not provide the connection service')
  return { ctx, shutdown, connection }
}

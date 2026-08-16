/**
 * @deepseek-ai/dsh-desktop-app — the desktop-surface bundle's runtime glue
 * plugin plus the bundle patch (`cordis.patch.yml`, declared by the
 * `dsh.bundle.patch` manifest field). The plugin owns the desktop-surface
 * glue: it republishes the app's assembly facts (the built renderer dist
 * root) as the `desktopRuntime` service the protocol carrier consumes,
 * registers the harness-source and desktop-surface prompt sections, and
 * syncs the app's theme preference to the native window color scheme through
 * the optional `desktopThemeSync` service. There is no URL line: the desktop
 * surface has no port to print.
 * @module @deepseek-ai/dsh-desktop-app
 */

import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import { addHarnessSourceSection } from '@deepseek-ai/dsh-app-boot'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { THEME_SETTINGS_NAMESPACE, type ThemePreference, type ThemeSettings } from '@deepseek-ai/dsh-client-ui-theme'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-settings/types'
import type {} from '@deepseek-ai/dsh-system-prompt'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Assembly facts the desktop app provides at boot (dist root). */
    desktopApp: DesktopAppFacts
    /** Desktop runtime facts republished for transport rows. */
    desktopRuntime: DesktopRuntime
    /** Native window color-scheme sync the desktop app provides under Electron. */
    desktopThemeSync: DesktopThemeSync
  }
}

/** This dsh installation's root, from either this package's source or built entry. */
const SOURCE_ROOT = fileURLToPath(new URL('../../../..', import.meta.url))

/** Assembly facts the app owns: where the built renderer lives. */
export interface DesktopAppFacts {
  /** Absolute directory containing the vite-built renderer (dist/). */
  distRoot: string
}

/** Runtime values the desktop carrier and surface rows consume. */
export interface DesktopRuntime {
  /** Absolute directory containing the vite-built renderer (dist/). */
  distRoot: string
}

/**
 * Native window color-scheme sync the desktop app provides under Electron.
 * The theme preference arrives schema-validated from the settings service;
 * 'system' keeps the OS's own appearance tracking intact.
 */
export interface DesktopThemeSync {
  /**
   * Apply the app's theme preference to the native window chrome.
   * @param preference - the persisted Light/Dark/System preference.
   */
  setThemePreference(preference: ThemePreference): void
}

/** The settings namespace carrying the app's theme preference. */
const THEME_NAMESPACE = settingsNamespace(THEME_SETTINGS_NAMESPACE)

/**
 * Model-visible orientation for sessions created through the desktop app.
 * @returns the prompt-section text describing the interaction surface.
 */
export function desktopSurfacePrompt(): string {
  return 'You are interacting with the user through the DeepSeek Harness desktop app. '
    + 'When the user refers to "this window", "this app", or "the desktop" without naming another target, they mean this desktop application. '
    + 'The desktop app runs the same session state as the DeepSeek Harness command line and web GUI, sharing one harness home. '
    + 'There is no web server and no URL for this surface; do not start one or tell the user to open a browser. '
    + 'The window renders the web UI over a local protocol, and native file dialogs open on the user’s machine.'
}

/**
 * The desktop runtime service: republishes the app's assembly facts and owns
 * the desktop-surface prompt section.
 */
export class DesktopRuntimeProvider extends Service {
  static inject = ['desktopApp']

  /** Absolute directory containing the vite-built renderer, republished from the app's assembly facts. */
  readonly distRoot: string

  /**
   * Build the service from the app-provided facts and register the
   * desktop-surface prompt sections through the same inject lifecycle other
   * sections ride.
   * @param ctx - plugin context carrying desktopApp and systemPrompt.
   */
  constructor(ctx: Context) {
    super(ctx, 'desktopRuntime')
    this.distRoot = ctx.desktopApp.distRoot
    ctx.inject(['systemPrompt'], (promptCtx) => {
      addHarnessSourceSection(promptCtx, SOURCE_ROOT)
      promptCtx.systemPrompt.section({
        name: 'app:desktop-surface',
        order: -98,
        text: () => desktopSurfacePrompt(),
      })
    })
    // Native color-scheme sync: the app's theme preference rides the settings
    // service (the ui-theme host row registers the namespace before this
    // bundle layer activates), so the native title bar follows the persisted
    // preference without any renderer round trip. Both hooks are optional —
    // the headless boot provides neither, and the plugin still serves
    // desktopRuntime alone.
    const sync = ctx.get('desktopThemeSync')
    if (sync !== undefined) {
      ctx.on('settings/updated', (ns, next) => {
        if (ns !== THEME_NAMESPACE) return
        sync.setThemePreference((next as ThemeSettings).preference)
      })
      const section = ctx.get('settings')?.get(THEME_NAMESPACE) as ThemeSettings | undefined
      if (section !== undefined) sync.setThemePreference(section.preference)
    }
  }
}

export default DesktopRuntimeProvider

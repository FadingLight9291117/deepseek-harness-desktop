/**
 * Package the Electron desktop shell as a macOS app bundle and zip. The
 * staged closure comes from `pnpm deploy` (see deploy-staging.ts) and the
 * app assembly from `@electron/packager`; the artifact is ad-hoc signed and
 * smoke-tested headless before the zip is written. The route is owned by
 * .agents/notes/implemented/process/2026-08-15-desktop-packaging-toolchain.md.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ParseArgsConfig } from 'node:util'
import { packager } from '@electron/packager'
import { deployStagingPackage, pnpmBin, runCommand } from './deploy-staging.ts'
import { parseScriptArgs, parseTargetList } from './script-args.ts'

const root = resolve(import.meta.dirname, '..')

/** The workspace package whose deploy closure is the app payload. */
const APP_FILTER = '@deepseek-ai/dsh-desktop'
/** App source directory, for the pinned Electron version. */
const APP_DIR = resolve(root, 'apps/desktop')
/** Artifact and staging root; `.artifacts/` is gitignored. */
const ARTIFACTS_DIR = resolve(root, '.artifacts', 'desktop')
/** App name: the packaged executable, bundle, and Dock name. */
const APP_NAME = 'DeepSeek'
/** macOS bundle id. */
const APP_BUNDLE_ID = 'ai.deepseek.dsh-desktop'
/** App icon committed beside the app source; regenerate from the web favicon when it changes. */
const APP_ICON = join(APP_DIR, 'build', 'icon.icns')
/** CFBundleShortVersionString accepts X.Y.Z only; the npm pre-release stays in the manifest. */
const APP_VERSION = '0.1.0'
/** The boot marker the packaged smoke waits for (host-boot.ts). */
const READY_MARKER = 'dsh desktop: host ready'

const ARCHES = ['arm64', 'x64'] as const
type Arch = (typeof ARCHES)[number]

/**
 * One packaging target: the macOS platform plus one CPU architecture.
 */
class Target {
  private constructor(readonly arch: Arch) {}

  /** The artifact basename, e.g. `DeepSeek-darwin-arm64`. */
  get spec(): string {
    return `${APP_NAME}-darwin-${this.arch}`
  }

  /**
   * Parse a target spec, rejecting non-macOS or unknown-arch targets.
   * @param spec - the raw `<platform>-<arch>` pair, e.g. `darwin-arm64`.
   * @returns the parsed target.
   */
  static parse(spec: string): Target {
    const parts = spec.split('-')
    const [platform, arch] = parts
    if (parts.length !== 2 || platform !== 'darwin' || !(ARCHES as readonly string[]).includes(arch ?? '')) {
      throw new Error(
        `package-desktop: target ${JSON.stringify(spec)} must be darwin-<arch> with arch one of ${ARCHES.join(', ')}.`,
      )
    }
    return new Target(arch as Arch)
  }

  /** Resolve the host as the default target. */
  static host(): Target {
    return new Target(process.arch === 'arm64' ? 'arm64' : 'x64')
  }
}

/**
 * Validated CLI configuration; construction owns help and parse-error exits.
 */
class PackageCli {
  private constructor(
    /** Packaging targets; defaults to the host. */
    readonly targets: readonly Target[],
    /** Skip `pnpm run build`; every workspace lib/ must already exist. */
    readonly skipBuild: boolean,
    /** Print every command and filesystem change instead of executing. */
    readonly dryRun: boolean,
    /** Copy the app into ~/Applications and open it after packaging. */
    readonly install: boolean,
  ) {}

  /**
   * Parse argv. Help exits 0; malformed flags exit 1.
   * @param argv - the raw arguments (`process.argv.slice(2)`).
   * @returns the parsed, validated configuration.
   */
  static parse(argv: string[]): PackageCli {
    const values = parseScriptArgs({ args: argv, options: PackageCli.parseOptions() }, () => PackageCli.usage(), 'package-desktop') as unknown as {
      'targets'?: string
      'skip-build': boolean
      'dry-run': boolean
      install: boolean
      help: boolean
    }
    const targets = parseTargetList(values.targets, spec => Target.parse(spec), () => Target.host())
    if (targets.length === 0) throw new Error('package-desktop: --targets is empty.')
    return new PackageCli(targets, values['skip-build'], values['dry-run'], values.install)
  }

  private static parseOptions() {
    return {
      'targets': { type: 'string' },
      'skip-build': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      'install': { type: 'boolean', default: false },
      'help': { type: 'boolean', default: false },
    } as const satisfies ParseArgsConfig['options']
  }

  private static usage(): string {
    return [
      'Usage: pnpm run package:desktop [flags]',
      '',
      '  --targets=<t1,t2,...>  macOS targets, e.g. darwin-arm64,darwin-x64.',
      '                         Default: the host arch.',
      '  --skip-build           skip `pnpm run build` (all workspace lib/ artifacts must exist).',
      '  --install              copy the packaged app to ~/Applications and open it.',
      '  --dry-run              print every command and filesystem change without executing.',
      '  --help                 print this help.',
      '',
      `Writes DeepSeek-darwin-<arch>.zip into ${ARTIFACTS_DIR}/.`,
      'The first run downloads the Electron dist zip; set ELECTRON_MIRROR when github.com is unreachable.',
    ].join('\n')
  }
}

/**
 * Rewrite the staged manifest for the packager: an X.Y.Z version (macOS
 * bundle metadata) and no devDependencies. Dependency entries keep their
 * names and ranges — the healed profile fallback reads only the names, and
 * the packager does not prune the staged tree.
 * @param staging - the deploy target.
 */
export async function normalizeManifest(staging: string): Promise<void> {
  const manifestPath = join(staging, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    version?: string
    devDependencies?: Record<string, string>
  }
  manifest.version = APP_VERSION
  delete manifest.devDependencies
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

/**
 * Confirm the node-pty prebuilds for the target and make them executable;
 * the persistent PTY backend loads them from the staged closure.
 * @param staging - the deploy target.
 * @param target - the packaging target.
 */
export async function prepareNativePty(staging: string, target: Target): Promise<void> {
  const prebuilds = join(staging, 'node_modules', 'node-pty', 'prebuilds', `darwin-${target.arch}`)
  const ptyNode = join(prebuilds, 'pty.node')
  const spawnHelper = join(prebuilds, 'spawn-helper')
  if (!existsSync(ptyNode) || !existsSync(spawnHelper)) {
    throw new Error(`package-desktop: node-pty darwin-${target.arch} prebuilds are missing from the staged closure.`)
  }
  await Promise.all([chmod(ptyNode, 0o755), chmod(spawnHelper, 0o755)])
}

/**
 * Run the packaged binary headless until the boot marker prints, then
 * dispose it with SIGTERM. Proves the app assembly boots from the bundle:
 * profile resolution, the healed module fallback, and the whole host tree.
 * @param appPath - the packaged .app directory.
 * @returns the boot output, for failure diagnostics.
 */
export async function smokePackagedApp(appPath: string): Promise<string> {
  const binary = join(appPath, 'Contents', 'MacOS', APP_NAME)
  const home = await mkdtemp(join(tmpdir(), 'deepseek-desktop-smoke-'))
  let output = ''
  const child = spawn(binary, ['--headless-boot', '--port', '0'], {
    env: {
      ...process.env,
      CI: 'true',
      DSH_HOME: home,
      DSH_TELEMETRY_DISABLED: '1',
    },
  })
  child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
  child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString() })
  try {
    await new Promise<void>((resolvePromise, reject) => {
      const deadline = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`package-desktop: packaged smoke timed out before "${READY_MARKER}".\n${output}`))
      }, 30_000)
      const poll = setInterval(() => {
        if (!output.includes(READY_MARKER)) return
        clearInterval(poll)
        clearTimeout(deadline)
        child.kill('SIGTERM')
      }, 100)
      child.once('error', (error) => {
        clearInterval(poll)
        clearTimeout(deadline)
        reject(error)
      })
      child.once('exit', (code, signal) => {
        clearInterval(poll)
        clearTimeout(deadline)
        if (code === 0 && signal === null) {
          resolvePromise()
          return
        }
        const cause = code === null ? `signal ${signal ?? 'unknown'}` : `exit code ${code}`
        reject(new Error(`package-desktop: packaged smoke failed (${cause}).\n${output}`))
      })
    })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
  return output
}

/**
 * Sequential packaging pipeline: build, stage, normalize, package, sign,
 * zip, smoke, optional install.
 */
class DesktopPackageBuild {
  readonly staging = join(ARTIFACTS_DIR, 'staging')

  constructor(private readonly cli: PackageCli) {}

  /** Build every workspace artifact unless `--skip-build` was passed. */
  async build(): Promise<void> {
    if (this.cli.skipBuild) {
      console.log('package-desktop: skipping pnpm run build (--skip-build)')
      return
    }
    await runCommand('package-desktop', 'build', pnpmBin(), ['run', 'build'], this.cli.dryRun)
  }

  /** Stage the deploy closure and normalize it for the packager. */
  async stage(): Promise<void> {
    await deployStagingPackage({
      prefix: 'package-desktop',
      dryRun: this.cli.dryRun,
      filter: APP_FILTER,
      staging: this.staging,
    })
    if (this.cli.dryRun) {
      console.log('package-desktop: [dry-run] normalize staged manifest')
      return
    }
    await normalizeManifest(this.staging)
  }

  /** Read the Electron version the app pins. */
  private electronVersion(): string {
    const manifest = JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8')) as {
      devDependencies?: Record<string, string>
    }
    const range = manifest.devDependencies?.electron
    if (range === undefined) throw new Error('package-desktop: apps/desktop pins no electron devDependency.')
    return range.replace(/^[\^~]/, '')
  }

  /** Package, sign, zip, and smoke one target. */
  async package(target: Target): Promise<{ appPath: string; zipPath: string }> {
    // The packager writes `<out>/<name>-<platform>-<arch>/<name>.app`.
    const appPath = join(ARTIFACTS_DIR, target.spec, `${APP_NAME}.app`)
    if (!this.cli.dryRun) {
      await mkdir(ARTIFACTS_DIR, { recursive: true })
      await prepareNativePty(this.staging, target)
      // asar is off: the Loader, the healed profile fallback, and the
      // /plugins client-bundle route read real files (koffi/node-pty
      // binaries cannot load from an archive), and symlink targets must
      // resolve to real paths.
      await packager({
        dir: this.staging,
        name: APP_NAME,
        platform: 'darwin',
        arch: target.arch,
        out: ARTIFACTS_DIR,
        overwrite: true,
        // prune is off: the deploy already staged the production closure,
        // and the packager's pruner matches version ranges against the tree
        // — `workspace:^` ranges in deployed transitive manifests would make
        // it drop packages like @deepseek-ai/cosmokit that the loader needs.
        prune: false,
        electronVersion: this.electronVersion(),
        appBundleId: APP_BUNDLE_ID,
        extendInfo: { CFBundleDisplayName: APP_NAME },
        asar: false,
      })
      if (!existsSync(appPath)) throw new Error(`package-desktop: packager produced no app at ${appPath}.`)
      // The packager leaves its default Electron icon in place; replace the
      // file the bundle's CFBundleIconFile already names with the committed
      // app icon.
      await cp(APP_ICON, join(appPath, 'Contents', 'Resources', 'electron.icns'))
    }
    // arm64 macOS refuses unsigned binaries; ad-hoc signing is the v1
    // stance (Developer ID signing and notarization stay out of scope).
    await runCommand('package-desktop', 'codesign', 'codesign', ['--force', '--deep', '--sign', '-', appPath], this.cli.dryRun)
    const zipPath = join(ARTIFACTS_DIR, `${target.spec}.zip`)
    if (!this.cli.dryRun) {
      await rm(zipPath, { force: true })
      await smokePackagedApp(appPath)
    } else {
      console.log('package-desktop: [dry-run] smoke packaged app (headless boot)')
    }
    await runCommand('package-desktop', 'zip', 'ditto', ['-c', '-k', '--keepParent', appPath, zipPath], this.cli.dryRun)
    return { appPath, zipPath }
  }

  /** Copy the packaged app into ~/Applications and open it. */
  async install(appPath: string): Promise<void> {
    const appsDir = join(homedir(), 'Applications')
    const destination = join(appsDir, `${APP_NAME}.app`)
    // ditto, not fs.cp: app bundles carry framework symlinks that must
    // survive the copy (fs.cp dereferences them by default).
    if (!this.cli.dryRun) await mkdir(appsDir, { recursive: true })
    await rm(destination, { recursive: true, force: true })
    await runCommand('package-desktop', 'install', 'ditto', [appPath, destination], this.cli.dryRun)
    if (!this.cli.dryRun) spawn('open', [destination], { detached: true, stdio: 'ignore' })
    console.log(`package-desktop: installed ${destination}`)
  }
}

async function main(): Promise<void> {
  const cli = PackageCli.parse(process.argv.slice(2))
  const build = new DesktopPackageBuild(cli)
  console.log(`package-desktop: targets: ${cli.targets.map(target => target.spec).join(', ')}`)
  console.log(`package-desktop: staging: ${build.staging}`)
  await build.build()
  await build.stage()
  for (const target of cli.targets) {
    const { appPath, zipPath } = await build.package(target)
    console.log(`package-desktop: ${zipPath}`)
    if (cli.install) await build.install(appPath)
  }
}

// Run the pipeline only when this file is the entry point (tests import
// the helpers without executing the build). `pnpm run` may forward its
// `--` separator; drop a leading one before parsing.
if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  if (process.argv[2] === '--') process.argv.splice(2, 1)
  await main()
}

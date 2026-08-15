/**
 * Shared pnpm-deploy staging for artifact pipelines: clear the target, run
 * `pnpm deploy` for one workspace package, restore legacy-hoisted
 * dependencies, and materialize every remaining symlink so the staged tree
 * is plain files. Shared by the Python SDK executable build and the desktop
 * packaging script — a staged tree must be symlink-free and self-contained
 * before any packager reads it.
 * @module deploy-staging
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, lstat, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

/** Repository root, the shared cwd for every pipeline subprocess. */
const root = resolve(import.meta.dirname, '..')

/** pnpm executable on the current platform. */
export function pnpmBin(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
}

/**
 * Render a command for logs and errors, quoting arguments with spaces.
 * @param command - the executable.
 * @param args - its arguments.
 * @returns the printable command line.
 */
function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(part => (part.includes(' ') ? JSON.stringify(part) : part)).join(' ')
}

/**
 * Run one pipeline subprocess with inherited stdio; dry runs print the
 * command without executing it. Errors carry the pipeline prefix, the
 * labeled step, and the printable command.
 * @param prefix - this pipeline's log prefix.
 * @param label - the step's name in logs and errors.
 * @param command - the executable.
 * @param args - its arguments.
 * @param dryRun - print instead of executing.
 */
export async function runCommand(
  prefix: string,
  label: string,
  command: string,
  args: string[],
  dryRun: boolean,
): Promise<void> {
  const printable = formatCommand(command, args)
  if (dryRun) {
    console.log(`${prefix}: [dry-run] ${printable}`)
    return
  }
  console.log(`${prefix}: ${label}: ${printable}`)
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      // Artifact builds must not mutate or validate a developer's Git hooks.
      env: { ...process.env, CI: 'true' },
    })
    child.once('error', (error) => {
      reject(new Error(`${prefix}: ${label} failed to spawn: ${error.message} (${printable})`))
    })
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      const cause = code === null ? `signal ${signal ?? 'unknown'}` : `exit code ${code}`
      reject(new Error(`${prefix}: ${label} failed (${cause}): ${printable}`))
    })
  })
}

/** Options for {@link deployStagingPackage}. */
export interface DeployStagingOptions {
  /** This pipeline's log prefix (also the dry-run prefix). */
  prefix: string
  /** Print every command and filesystem change without executing. */
  dryRun: boolean
  /** Workspace package filter handed to `pnpm --filter <filter> deploy`. */
  filter: string
  /** Deploy target directory; cleared first. Must sit inside the repo or in /tmp style paths — never the repo root itself. */
  staging: string
  /**
   * node_modules source for dependencies the legacy hoister leaves beside
   * the deploy source instead of in the target. Absent when the deployment
   * is already complete (the desktop app deploys fully).
   */
  restoreSource?: string
  /** Deploy-only files to remove from the staged root. */
  removeDocs?: readonly string[]
}

/**
 * Clear, deploy, and materialize one workspace package into `staging`:
 * `pnpm --filter <filter> deploy --legacy --prod` (hoisted layout, no
 * auto-installed peers), then optional legacy-hoist restore, then symlink
 * materialization (package links become file copies; `.bin` shim dirs are
 * removed — a packaged payload needs no executables).
 * @param options - target, filter, and pipeline behavior.
 */
export async function deployStagingPackage(options: DeployStagingOptions): Promise<void> {
  const { prefix, dryRun, filter, staging, restoreSource, removeDocs } = options
  if (staging === root || root.startsWith(staging + sep)) {
    throw new Error(`${prefix}: refusing to clear staging dir ${staging}: it contains the repo root.`)
  }
  if (dryRun) {
    console.log(`${prefix}: [dry-run] rm -rf ${staging}`)
  } else {
    await rm(staging, { recursive: true, force: true })
  }
  await runCommand(prefix, 'deploy', pnpmBin(), [
    '--filter',
    filter,
    'deploy',
    '--legacy',
    '--prod',
    '--config.node-linker=hoisted',
    '--config.auto-install-peers=false',
    '--config.link-workspace-packages=true',
    staging,
  ], dryRun)
  // The legacy deploy hoists peer-specialized packages into the deploy
  // source's node_modules inside the main workspace; a plain install
  // restores the canonical state so later `pnpm run` invocations pass
  // their deps-status check.
  await runCommand(prefix, 'restore workspace install', pnpmBin(), ['install'], dryRun)
  if (restoreSource !== undefined) await restoreLegacyHoists(prefix, dryRun, staging, restoreSource)
  await materializeStagedLinks(prefix, dryRun, staging)
  await restoreOmittedClosureDeps(prefix, dryRun, staging)
  if (removeDocs !== undefined && removeDocs.length > 0) {
    if (dryRun) {
      for (const name of removeDocs) console.log(`${prefix}: [dry-run] rm -f ${join(staging, name)}`)
    } else {
      await Promise.all(removeDocs.map(name => rm(join(staging, name), { force: true })))
    }
  }
}

/**
 * Restore direct dependencies that pnpm's legacy hoister places beside the
 * deploy source instead of in the target. The runtime manifest supplies
 * every peer, so package-local node_modules trees are omitted to preserve
 * one flat Cordis instance and a symlink-free packaged payload.
 * @param prefix - pipeline log prefix.
 * @param dryRun - print instead of executing.
 * @param staging - the deploy target.
 * @param restoreSource - node_modules directory to restore from.
 */
async function restoreLegacyHoists(
  prefix: string,
  dryRun: boolean,
  staging: string,
  restoreSource: string,
): Promise<void> {
  if (dryRun) {
    console.log(`${prefix}: [dry-run] restore direct dependencies omitted by legacy deploy`)
    return
  }
  const manifestPath = join(staging, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    dependencies?: Record<string, string>
  }
  const restored: string[] = []
  for (const dependency of Object.keys(manifest.dependencies ?? {}).sort()) {
    const destination = join(staging, 'node_modules', dependency)
    if (existsSync(destination)) continue
    const source = join(restoreSource, dependency)
    if (!existsSync(source)) {
      throw new Error(
        `${prefix}: deployed dependency ${dependency} is absent from both ${destination} and ${source}.`,
      )
    }
    await copyPackageTree(source, destination)
    restored.push(dependency)
  }
  const stillMissing = Object.keys(manifest.dependencies ?? {})
    .filter(dependency => !existsSync(join(staging, 'node_modules', dependency)))
  if (stillMissing.length > 0) {
    throw new Error(`${prefix}: staged dependencies remain missing: ${stillMissing.join(', ')}.`)
  }
  if (restored.length > 0) {
    console.log(`${prefix}: restored legacy deploy hoists: ${restored.join(', ')}`)
  }
}

/**
 * Restore transitive closure members the deploy omitted. `pnpm deploy` does
 * not follow workspace-link overrides (`link:` entries in
 * pnpm-workspace.yaml) for transitive dependencies, so packages like
 * `@deepseek-ai/cosmokit` (a dependency of vendored cordis) are absent
 * from the staged tree while the deployed manifests still declare them —
 * the runtime loader then fails their imports. Each missing name is copied
 * from the repo root's `@deepseek-ai` workspace mirror (maintained by
 * install-workspace-links.mjs), which carries every workspace package.
 * @param prefix - pipeline log prefix.
 * @param dryRun - print instead of executing.
 * @param staging - the deploy target.
 */
async function restoreOmittedClosureDeps(prefix: string, dryRun: boolean, staging: string): Promise<void> {
  const manifestAt = async (name: string): Promise<Record<string, unknown> | undefined> => {
    const path = join(staging, 'node_modules', name, 'package.json')
    if (!existsSync(path)) return undefined
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  }
  const names = async (manifest: Record<string, unknown> | undefined): Promise<string[]> => [
    ...Object.keys(manifest?.dependencies as Record<string, string> | undefined ?? {}),
    ...Object.keys(manifest?.peerDependencies as Record<string, string> | undefined ?? {}),
  ]
  // BFS over the deployed manifests; the heal performs the same walk at
  // boot, so this set is exactly what the packaged app will try to resolve.
  const rootManifest = JSON.parse(await readFile(join(staging, 'package.json'), 'utf8')) as Record<string, unknown>
  const queue = await names(rootManifest)
  const seen = new Set<string>()
  const missing = new Set<string>()
  while (queue.length > 0) {
    const name = queue.shift()
    if (name === undefined) continue
    if (seen.has(name)) continue
    seen.add(name)
    const manifest = await manifestAt(name)
    if (manifest === undefined) {
      missing.add(name)
      continue
    }
    queue.push(...await names(manifest))
  }
  if (missing.size === 0) return
  if (dryRun) {
    console.log(`${prefix}: [dry-run] restore omitted closure deps: ${[...missing].sort().join(', ')}`)
    return
  }
  const mirror = join(root, 'node_modules')
  const restored: string[] = []
  const absentEverywhere: string[] = []
  for (const name of [...missing].sort()) {
    let source = join(mirror, name)
    if (!existsSync(source)) {
      // Real npm packages live in the pnpm store; the deploy can drop one
      // without a workspace override, and the workspace mirror carries only
      // @deepseek-ai packages. Match the store dir by encoded name.
      const encoded = name.replace('/', '+')
      const candidates = (await readdir(join(mirror, '.pnpm'))).filter(dir => dir.startsWith(`${encoded}@`)).sort()
      source = candidates.map(dir => join(mirror, '.pnpm', dir, 'node_modules', name)).find(existsSync) ?? ''
    }
    if (!existsSync(source)) {
      // Installed nowhere in the workspace: an optional dependency (e.g.
      // ws's bufferutil) that nothing builds. The packaged boot smoke owns
      // the completeness verdict for everything the loader really imports.
      absentEverywhere.push(name)
      continue
    }
    const destination = join(staging, 'node_modules', name)
    await copyPackageTree(source, destination)
    restored.push(name)
  }
  if (restored.length > 0) console.log(`${prefix}: restored omitted closure deps: ${restored.join(', ')}`)
  if (absentEverywhere.length > 0) console.log(`${prefix}: omitted closure deps absent from the workspace (optional): ${absentEverywhere.join(', ')}`)
}

/**
 * Copy one package directory into the staged tree with its own
 * node_modules omitted: the flat staged layout is the resolution source,
 * so nested trees would shadow it.
 * @param source - the package directory to copy.
 * @param destination - its place under the staged node_modules.
 */
async function copyPackageTree(source: string, destination: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true })
  const nestedNodeModules = join(source, 'node_modules')
  await cp(source, destination, {
    recursive: true,
    dereference: true,
    filter: path => path !== nestedNodeModules && !path.startsWith(nestedNodeModules + sep),
  })
}

/**
 * Replace deploy-time package symlinks with file copies and delete `.bin`
 * shim directories; the staged tree must contain no symlinks before a
 * packager reads it.
 * @param prefix - pipeline log prefix.
 * @param dryRun - print instead of executing.
 * @param staging - the deploy target.
 */
async function materializeStagedLinks(prefix: string, dryRun: boolean, staging: string): Promise<void> {
  if (dryRun) {
    console.log(`${prefix}: [dry-run] materialize staged package links`)
    return
  }
  const nodeModules = join(staging, 'node_modules')
  let remaining = await findSymlink(nodeModules)
  while (remaining !== undefined) {
    const segments = remaining.slice(nodeModules.length + 1).split(sep)
    const binIndex = segments.lastIndexOf('.bin')
    if (binIndex >= 0) {
      await rm(join(nodeModules, ...segments.slice(0, binIndex + 1)), { recursive: true, force: true })
      remaining = await findSymlink(nodeModules)
      continue
    }
    const destination = remaining
    const source = await realpath(destination)
    const nestedNodeModules = join(source, 'node_modules')
    await rm(destination, { recursive: true, force: true })
    await cp(source, destination, {
      recursive: true,
      dereference: true,
      filter: path => path !== nestedNodeModules && !path.startsWith(nestedNodeModules + sep),
    })
    remaining = await findSymlink(nodeModules)
  }
}

/** Return the first symbolic link below a directory, if one exists. */
async function findSymlink(directory: string): Promise<string | undefined> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const metadata = await lstat(path)
    if (metadata.isSymbolicLink()) return path
    if (metadata.isDirectory()) {
      const nested = await findSymlink(path)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

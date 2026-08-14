/**
 * Mirror-link every @deepseek-ai workspace package into the repository-root
 * node_modules. Electron's ESM loader realpaths pnpm's symlinks, so a
 * profile-resolved row package loads from its REAL location and walks up to
 * the root node_modules for every bare @deepseek-ai import — without these
 * links that walk-up finds nothing and preset mounting fails under Electron
 * (plain Node keeps the profile-fallback resolution it has always used).
 * Idempotent; runs from postinstall so every install (re)creates the links
 * pnpm's prune may have removed.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Workspace globs mirrored from pnpm-workspace.yaml's packages list. */
const PACKAGE_DIRS = [
  'vendor',
  'packages',
  'apps',
  'native/landlock-run/packages',
]

/** One level below `packages/` (group dirs); everything else is a direct package dir. */
function packageDirs() {
  const dirs = []
  for (const base of PACKAGE_DIRS) {
    const abs = join(root, base)
    if (!existsSync(abs)) continue
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const child = join(abs, entry.name)
      if (base === 'packages') {
        for (const inner of readdirSync(child, { withFileTypes: true })) {
          if (inner.isDirectory()) dirs.push(join(child, inner.name))
        }
      } else {
        dirs.push(child)
      }
    }
  }
  return dirs
}

const links = []
for (const dir of packageDirs()) {
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) continue
  const name = JSON.parse(readFileSync(manifestPath, 'utf8')).name
  if (typeof name !== 'string' || !name.startsWith('@deepseek-ai/')) continue
  const target = join(root, 'node_modules', ...name.split('/'))
  mkdirSync(dirname(target), { recursive: true })
  if (existsSync(target) || existsSync(join(target, 'package.json'))) continue // pnpm-managed entry wins
  try {
    if (existsSync(target)) rmSync(target, { force: true })
  } catch { /* missing link target */ }
  symlinkSync(relative(dirname(target), dir), target, 'dir')
  links.push(`${name} -> ${relative(root, dir)}`)
}

console.log(`install-workspace-links: ${links.length} @deepseek-ai package link(s) at node_modules/@deepseek-ai`)

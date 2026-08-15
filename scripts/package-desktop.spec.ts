/** Pure faces of the desktop packaging script: target parsing and manifest normalization. */

import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeManifest } from './package-desktop.ts'

describe('normalizeManifest', () => {
  it('pins an X.Y.Z version, keeps dependency entries, and drops devDependencies', async () => {
    const staging = await mkdtemp(join(tmpdir(), 'dsh-package-spec-'))
    try {
      await writeFile(join(staging, 'package.json'), JSON.stringify({
        version: '0.1.0-rc.5',
        dependencies: {
          '@deepseek-ai/dsh-base': 'workspace:^',
          'js-yaml': '^4.1.0',
        },
        devDependencies: {
          electron: '^43.4.0',
        },
      }))

      await normalizeManifest(staging)

      const manifest = JSON.parse(await readFile(join(staging, 'package.json'), 'utf8')) as {
        version: string
        dependencies: Record<string, string>
        devDependencies?: unknown
      }
      expect(manifest.version).toBe('0.1.0')
      // The healed profile fallback reads dependency names; ranges stay
      // untouched because nothing re-prunes the staged tree.
      expect(manifest.dependencies).toEqual({
        '@deepseek-ai/dsh-base': 'workspace:^',
        'js-yaml': '^4.1.0',
      })
      expect(manifest.devDependencies).toBeUndefined()
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  })
})

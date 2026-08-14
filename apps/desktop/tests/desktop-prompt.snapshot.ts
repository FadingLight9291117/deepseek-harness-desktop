import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import {
  createUserMessage,
  LlmAdapter,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { bootDesktopHost } from '../src/main/host-boot.ts'

class PromptCaptureAdapter extends LlmAdapter {
  request: GenerateOptions | undefined

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.request = options
    const text = 'DESKTOP_PROMPT_SNAPSHOT_OK'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

describe('assembled desktop prompt', () => {
  let home: string
  let workspace: string
  let handle: AgentHandle
  let disposeHost: (() => Promise<void>) | undefined
  let adapter: PromptCaptureAdapter
  let originalEnvironment: Record<string, string | undefined>

  beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-desktop-prompt-home-'))
    workspace = await mkdtemp(join(tmpdir(), 'dsh-desktop-prompt-workspace-'))
    originalEnvironment = Object.fromEntries([
      'DSH_HOME',
      'DSH_AGENTS_HOME',
      'DSH_BUNDLED_SKILL_DIR',
      'DSH_TELEMETRY_DISABLED',
    ].map(name => [name, process.env[name]]))
    Object.assign(process.env, {
      DSH_HOME: home,
      DSH_AGENTS_HOME: join(home, 'agents'),
      DSH_BUNDLED_SKILL_DIR: join(home, 'bundled-skills'),
      DSH_TELEMETRY_DISABLED: '1',
    })

    const overlay = join(home, 'snapshot.patch.yml')
    await writeFile(overlay, [
      '- id: llm-deepseek',
      '  disabled: true',
      '- id: agent-instructions',
      '  disabled: true',
      '- id: session-title-llm',
      '  disabled: true',
      '',
    ].join('\n'))

    const desktop = await bootDesktopHost({ profile: 'desktop', patchFiles: [overlay], args: [] })
    disposeHost = () => desktop.shutdown.shutdown(0)
    adapter = new PromptCaptureAdapter()
    desktop.ctx.llm.registerAdapter(['desktop-prompt-snapshot'], adapter)
    handle = await desktop.ctx.agents.create({
      sessionId: SessionId('desktop-prompt-snapshot'),
      meta: { cwd: workspace, agentPreset: 'standard' },
      agentOptions: { provider: 'desktop-prompt-snapshot', model: 'desktop-prompt-snapshot' },
      setup: agentCtx => desktop.ctx.agentPresets.mount(agentCtx, 'standard').then(() => undefined),
    })
  })

  afterAll(async () => {
    const failures: unknown[] = []
    await handle?.dispose().catch((error: unknown) => failures.push(error))
    await disposeHost?.().catch((error: unknown) => failures.push(error))
    await rm(home, { recursive: true, force: true }).catch((error: unknown) => failures.push(error))
    await rm(workspace, { recursive: true, force: true }).catch((error: unknown) => failures.push(error))
    for (const [name, value] of Object.entries(originalEnvironment ?? {})) {
      if (value === undefined) Reflect.deleteProperty(process.env, name)
      else process.env[name] = value
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'desktop prompt snapshot teardown failed')
  })

  it('pins the model request assembled by the shipped desktop profile', async () => {
    handle.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Reply exactly DESKTOP_PROMPT_SNAPSHOT_OK and stop.' }],
      source: { kind: 'user' },
    }))
    await handle.agent.whenIdle()

    const system = adapter.request?.system
    if (system === undefined) throw new Error('desktop prompt snapshot issued no model request')
    const stable = system
      .replaceAll(process.cwd(), '{{repoRoot}}')
      .replaceAll(workspace, '{{cwd}}')
    await expect(`${stable}\n`).toMatchFileSnapshot(
      './snapshots/desktop-prompt/system-prompt.expected.md',
    )
  })
})

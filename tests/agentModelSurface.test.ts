import test from 'node:test'
import assert from 'node:assert/strict'

function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of previous.entries()) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    })
}

test('codex-only Agent tool schema accepts concrete Codex model ids and reasoning_effort', async () => {
  await withEnv(
    {
      CODEX_CODE_USE_CODEX_PROVIDER: '1',
    },
    async () => {
      const { inputSchema } = await import('../src/tools/AgentTool/AgentTool.tsx')

      const parsed = inputSchema().safeParse({
        description: 'inspect drift',
        prompt: 'Compare two repos and summarize differences.',
        subagent_type: 'Explore',
        model: 'gpt-5.4-mini',
        reasoning_effort: 'xhigh',
      })
      assert.equal(parsed.success, true)

      const legacyAlias = inputSchema().safeParse({
        description: 'inspect drift',
        prompt: 'Compare two repos and summarize differences.',
        subagent_type: 'Explore',
        model: 'sonnet',
      })
      assert.equal(legacyAlias.success, false)
    },
  )
})

test('legacy codex agent aliases still map to the expected effort presets internally', async () => {
  await withEnv(
    {
      CODEX_CODE_USE_CODEX_PROVIDER: '1',
    },
    async () => {
      const { getAgentEffort } = await import('../src/utils/model/agent.ts')

      assert.equal(getAgentEffort('haiku', undefined), 'xhigh')
      assert.equal(getAgentEffort('sonnet', undefined), 'medium')
      assert.equal(getAgentEffort('opus', undefined), 'xhigh')
    },
  )
})

test('explicit Codex model override clears built-in effort unless reasoning_effort is also set', async () => {
  await withEnv(
    {
      CODEX_CODE_USE_CODEX_PROVIDER: '1',
    },
    async () => {
      const { getAgentEffort } = await import('../src/utils/model/agent.ts')

      assert.equal(
        getAgentEffort('gpt-5.4-mini', 'xhigh', 'gpt-5.4'),
        undefined,
      )
      assert.equal(
        getAgentEffort('gpt-5.4-mini', 'xhigh', 'gpt-5.4', 'high'),
        'high',
      )
    },
  )
})

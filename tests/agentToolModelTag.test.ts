import test from 'node:test'
import assert from 'node:assert/strict'

function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<void>,
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

test('Explore tool tag resolves codex helper-agent model from the built-in default', async () => {
  await withEnv(
    {
      CODEX_CODE_USE_CODEX_PROVIDER: '1',
      CODEX_CODE_SMALL_FAST_MODEL: 'gpt-5.4-mini',
      ANTHROPIC_SMALL_FAST_MODEL: undefined,
    },
    async () => {
      const { getAgentToolUseModelTag } = await import(
        '../src/tools/AgentTool/toolUseModel.ts'
      )

      assert.equal(
        getAgentToolUseModelTag({ subagent_type: 'Explore' }, 'gpt-5.4'),
        'gpt-5.4-mini',
      )
    },
  )
})

test('Explore tool tag stays hidden when the helper model matches the parent model', async () => {
  await withEnv(
    {
      CODEX_CODE_USE_CODEX_PROVIDER: '1',
      CODEX_CODE_SMALL_FAST_MODEL: 'gpt-5.4-mini',
      ANTHROPIC_SMALL_FAST_MODEL: undefined,
    },
    async () => {
      const { getAgentToolUseModelTag } = await import(
        '../src/tools/AgentTool/toolUseModel.ts'
      )

      assert.equal(
        getAgentToolUseModelTag({ subagent_type: 'Explore' }, 'gpt-5.4-mini'),
        null,
      )
    },
  )
})

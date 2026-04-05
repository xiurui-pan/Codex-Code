import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

const ENV_KEYS = [
  'CODEX_CODE_MODEL_CONTEXT_WINDOW',
  'CODEX_CODE_MODEL_AUTO_COMPACT_TOKEN_LIMIT',
] as const

const previousEnv = new Map<string, string | undefined>()

function setEnv(overrides: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    if (!previousEnv.has(key)) {
      previousEnv.set(key, process.env[key])
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = previousEnv.get(key)
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  previousEnv.clear()
})

test('codex-aligned context window defaults to the effective 258.4k window', async () => {
  setEnv({
    CODEX_CODE_MODEL_CONTEXT_WINDOW: undefined,
    CODEX_CODE_MODEL_AUTO_COMPACT_TOKEN_LIMIT: undefined,
  })

  const { getContextWindowForModel } = await import('../src/utils/context.js')
  const { getAutoCompactThreshold } = await import(
    '../src/services/compact/autoCompact.js'
  )

  assert.equal(getContextWindowForModel('gpt-5.4'), 258_400)
  assert.equal(getAutoCompactThreshold('gpt-5.4'), 244_800)
})

test('codex-aligned context window and auto compact limit honor ~/.codex/config.toml env projection', async () => {
  setEnv({
    CODEX_CODE_MODEL_CONTEXT_WINDOW: '400000',
    CODEX_CODE_MODEL_AUTO_COMPACT_TOKEN_LIMIT: '390000',
  })

  const { getContextWindowForModel } = await import('../src/utils/context.js')
  const { getAutoCompactThreshold } = await import(
    '../src/services/compact/autoCompact.js'
  )

  assert.equal(getContextWindowForModel('gpt-5.4'), 380_000)
  // Codex CLI clamps auto compact to 90% of the raw context window.
  assert.equal(getAutoCompactThreshold('gpt-5.4'), 360_000)
})

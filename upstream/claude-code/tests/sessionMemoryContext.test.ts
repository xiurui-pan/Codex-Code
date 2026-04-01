import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createCurrentSessionMemoryAttachment,
  isCodexSessionMemoryEnabled,
  shouldIncludeCurrentSessionMemory,
} from '../src/services/SessionMemory/sessionMemoryContext.js'

function withEnv<T>(
  key: string,
  value: string | undefined,
  fn: () => T,
): T {
  const previous = process.env[key]
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
  try {
    return fn()
  } finally {
    if (previous === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = previous
    }
  }
}

test('codex session memory gate defaults on for custom codex provider', () => {
  const enabled = withEnv('CLAUDE_CODE_USE_CODEX_PROVIDER', '1', () =>
    isCodexSessionMemoryEnabled(),
  )
  assert.equal(enabled, true)
})

test('current session memory injection only targets main codex query paths', () => {
  const result = withEnv('CLAUDE_CODE_USE_CODEX_PROVIDER', '1', () => ({
    repl: shouldIncludeCurrentSessionMemory('repl_main_thread'),
    sdk: shouldIncludeCurrentSessionMemory('sdk'),
    compact: shouldIncludeCurrentSessionMemory('compact'),
    fork: shouldIncludeCurrentSessionMemory('session_memory'),
    other: shouldIncludeCurrentSessionMemory('agent'),
  }))

  assert.deepEqual(result, {
    repl: true,
    sdk: true,
    compact: false,
    fork: false,
    other: false,
  })
})

test('current session memory attachment keeps structured summary content', () => {
  const attachment = createCurrentSessionMemoryAttachment({
    content: '  # Current State\nShip Codex memory path\n',
    path: '/tmp/session-memory/summary.md',
  })

  assert.deepEqual(attachment, {
    type: 'current_session_memory',
    content: '# Current State\nShip Codex memory path',
    path: '/tmp/session-memory/summary.md',
    tokenCount: 10,
  })
})

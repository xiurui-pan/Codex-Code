import assert from 'node:assert/strict'
import test from 'node:test'
import { createUserMessage } from '../src/utils/messages.js'
import { BASH_TOOL_NAME } from '../src/tools/BashTool/toolName.js'
import { detectRedundantToolCall } from '../src/services/tools/toolEfficiency.js'

function createBashAssistant(command: string, id = 'tool-1') {
  return {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          id,
          name: BASH_TOOL_NAME,
          input: { command },
        },
      ],
    },
  } as const
}

function createToolResult(toolUseId: string, content = 'ok', isError = false) {
  return createUserMessage({
    content: [
      {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content,
        is_error: isError,
      },
    ],
    toolUseResult: content,
  })
}

test('blocks repeated current-branch checks inside the same user request', () => {
  const messages = [
    createUserMessage({ content: 'tell me the branch' }),
    createBashAssistant('git branch --show-current', 'branch-1'),
    createToolResult('branch-1', 'main'),
  ]

  const message = detectRedundantToolCall(
    BASH_TOOL_NAME,
    { command: 'git branch --show-current || true' },
    { messages },
  )

  assert.match(message ?? '', /already checked the current git branch/i)
})

test('blocks repeated equivalent search commands inside the same user request', () => {
  const messages = [
    createUserMessage({ content: 'find the marker' }),
    createBashAssistant('rg -n "MARKER" src', 'search-1'),
    createToolResult('search-1', 'src/file.ts:12:MARKER'),
  ]

  const message = detectRedundantToolCall(
    BASH_TOOL_NAME,
    { command: 'rg -n "MARKER" src' },
    { messages },
  )

  assert.match(message ?? '', /equivalent search or read command/i)
})

test('does not block rerunning non-search commands like tests', () => {
  const messages = [
    createUserMessage({ content: 'run the tests again' }),
    createBashAssistant('pnpm test', 'test-1'),
    createToolResult('test-1', 'all good'),
  ]

  const message = detectRedundantToolCall(
    BASH_TOOL_NAME,
    { command: 'pnpm test' },
    { messages },
  )

  assert.equal(message, null)
})

test('blocks inline scripts that mainly dump file contents', () => {
  const message = detectRedundantToolCall(
    BASH_TOOL_NAME,
    {
      command: `python3 - <<'PY'
from pathlib import Path
print(Path('foo.txt').read_text())
PY`,
    },
    { messages: [] },
  )

  assert.match(message ?? '', /inline script whose main job is dumping file contents/i)
})

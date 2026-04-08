import assert from 'node:assert/strict'
import test from 'node:test'
import { createUserMessage } from '../src/utils/messages.js'
import { BASH_TOOL_NAME } from '../src/tools/BashTool/toolName.js'
import {
  buildSyntheticToolPreamble,
  buildToolEfficiencyReminder,
  detectRedundantToolCall,
} from '../src/services/tools/toolEfficiency.js'
import { FILE_READ_TOOL_NAME } from '../src/tools/FileReadTool/constants.js'

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

function createAssistantText(text: string) {
  return {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'text',
          text,
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

test('adds a hidden efficiency reminder after a silent investigative streak', () => {
  const reminder = buildToolEfficiencyReminder({
    messages: [createUserMessage({ content: 'inspect these files' })],
    assistantMessages: [
      createBashAssistant('rg --files src', 'a'),
    ],
    toolUseBlocks: [
      {
        type: 'tool_use',
        id: 'a',
        name: BASH_TOOL_NAME,
        input: { command: 'rg --files src' },
      },
      {
        type: 'tool_use',
        id: 'b',
        name: BASH_TOOL_NAME,
        input: { command: 'git branch --show-current' },
      },
      {
        type: 'tool_use',
        id: 'c',
        name: FILE_READ_TOOL_NAME,
        input: { file_path: 'src/index.ts' },
      },
    ],
  })

  assert.match(reminder ?? '', /^Tool-efficiency reminder:/)
  assert.match(reminder ?? '', /send one short progress update/i)
})

test('builds a visible synthetic preamble before the first main-thread tool batch', () => {
  const preamble = buildSyntheticToolPreamble({
    messages: [createUserMessage({ content: 'find the helper' })],
    assistantMessages: [createBashAssistant('rg --files src', 'a')],
    toolUseBlocks: [
      {
        type: 'tool_use',
        id: 'a',
        name: BASH_TOOL_NAME,
        input: { command: 'rg --files src' },
      },
    ],
    isMainThread: true,
  })

  assert.equal(typeof preamble, 'string')
  assert.match(preamble ?? '', /locate the relevant implementation/i)
})

test('builds a Chinese tracking note when the user prompt is in Chinese', () => {
  const preamble = buildSyntheticToolPreamble({
    messages: [createUserMessage({ content: '帮我找一下相关实现' })],
    assistantMessages: [createBashAssistant('rg --files src', 'a')],
    toolUseBlocks: [
      {
        type: 'tool_use',
        id: 'a',
        name: BASH_TOOL_NAME,
        input: { command: 'rg --files src' },
      },
    ],
    isMainThread: true,
  })

  assert.match(preamble ?? '', /先定位相关实现和调用点/)
})

test('does not build a synthetic preamble when assistant text already exists in the current request', () => {
  const preamble = buildSyntheticToolPreamble({
    messages: [
      createUserMessage({ content: 'find the helper' }),
      createAssistantText('I found the likely area and will confirm one file.'),
    ],
    assistantMessages: [createBashAssistant('rg --files src', 'a')],
    toolUseBlocks: [
      {
        type: 'tool_use',
        id: 'a',
        name: BASH_TOOL_NAME,
        input: { command: 'rg --files src' },
      },
    ],
    isMainThread: true,
  })

  assert.equal(preamble, null)
})

test('builds a follow-up synthetic preamble after earlier tool work if no fresh note was shown afterward', () => {
  const preamble = buildSyntheticToolPreamble({
    messages: [
      createUserMessage({ content: '帮我查一下哪里有问题' }),
      createAssistantText('先定位相关实现和调用点。'),
      createBashAssistant('rg -n "MARKER" src', 'search-1'),
      createToolResult('search-1', 'src/file.ts:12:MARKER'),
    ],
    assistantMessages: [createBashAssistant('rg -n "SECOND" src', 'search-2')],
    toolUseBlocks: [
      {
        type: 'tool_use',
        id: 'search-2',
        name: BASH_TOOL_NAME,
        input: { command: 'rg -n "SECOND" src' },
      },
    ],
    isMainThread: true,
  })

  assert.match(preamble ?? '', /已经缩小到相关范围了，我再核对最后一个关键点。/)
})

test('adds the reminder after the first silent search batch so the next turn is not mute again', () => {
  const reminder = buildToolEfficiencyReminder({
    messages: [createUserMessage({ content: 'find the relevant file' })],
    assistantMessages: [createBashAssistant('rg --files src', 'a')],
    toolUseBlocks: [
      {
        type: 'tool_use',
        id: 'a',
        name: BASH_TOOL_NAME,
        input: { command: 'rg --files src' },
      },
    ],
  })

  assert.match(reminder ?? '', /^Tool-efficiency reminder:/)
})

test('skips the reminder when assistant text is already visible in the batch', () => {
  const reminder = buildToolEfficiencyReminder({
    messages: [createUserMessage({ content: 'inspect these files' })],
    assistantMessages: [createAssistantText('I found the first clue and will confirm one file.')],
    toolUseBlocks: [
      {
        type: 'tool_use',
        id: 'a',
        name: BASH_TOOL_NAME,
        input: { command: 'rg --files src' },
      },
      {
        type: 'tool_use',
        id: 'b',
        name: BASH_TOOL_NAME,
        input: { command: 'git branch --show-current' },
      },
      {
        type: 'tool_use',
        id: 'c',
        name: FILE_READ_TOOL_NAME,
        input: { file_path: 'src/index.ts' },
      },
    ],
  })

  assert.equal(reminder, null)
})

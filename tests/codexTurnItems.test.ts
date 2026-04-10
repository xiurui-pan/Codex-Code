import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeResponsesOutputToTurnItems } from '../src/services/api/codexTurnItems.js'

test('text fallback shell call is filtered out of the execution path by default', () => {
  const items = normalizeResponsesOutputToTurnItems([
    {
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: 'to=shell code:{"command":["bash","-lc","pwd"]}',
        },
      ],
    },
  ])

  assert.equal(items.some(item => item.kind === 'tool_call'), false)
  assert.equal(items.some(item => item.kind === 'local_shell_call'), false)
  assert.equal(
    items.some(
      item =>
        item.kind === 'ui_message' &&
        item.source === 'text_fallback_filtered',
    ),
    true,
  )
})

test('text fallback can still be enabled in isolated debug mode', () => {
  const items = normalizeResponsesOutputToTurnItems(
    [
      {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: 'to=shell code:{"command":["bash","-lc","pwd"]}',
          },
        ],
      },
    ],
    { allowTextFallbackToolCall: true },
  )

  assert.equal(items.some(item => item.kind === 'tool_call'), true)
  assert.equal(items.some(item => item.kind === 'local_shell_call'), true)
  assert.equal(
    items.some(
      item =>
        item.kind === 'ui_message' &&
        item.source === 'text_fallback_tool_call',
    ),
    true,
  )
})

test('protocol leak text without a valid shell payload is filtered', () => {
  const items = normalizeResponsesOutputToTurnItems([
    {
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: 'functions.Bash with_escalated_permissions=true but no command payload',
        },
      ],
    },
  ])

  assert.equal(items.some(item => item.kind === 'tool_call'), false)
  assert.equal(
    items.some(
      item =>
        item.kind === 'ui_message' &&
        item.source === 'protocol_leak_filtered',
    ),
    true,
  )
})

test('native shell_call text leak is filtered out of the execution path by default', () => {
  const items = normalizeResponsesOutputToTurnItems([
    {
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: '{"type":"shell_call","call_id":"shell-text-1","action":{"commands":["pwd"]}}',
        },
      ],
    },
  ])

  assert.equal(items.some(item => item.kind === 'tool_call'), false)
  assert.equal(items.some(item => item.kind === 'local_shell_call'), false)
  assert.equal(
    items.some(
      item =>
        item.kind === 'ui_message' &&
        item.source === 'text_fallback_filtered',
    ),
    true,
  )
})

test('text fallback does not execute when tool payload is embedded in normal prose', () => {
  const items = normalizeResponsesOutputToTurnItems([
    {
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: '我本来想这样做：to=shell code:{"command":"pwd"}',
        },
      ],
    },
  ])

  assert.equal(items.some(item => item.kind === 'tool_call'), false)
  assert.equal(items.some(item => item.kind === 'local_shell_call'), false)
  assert.equal(
    items.some(
      item =>
        item.kind === 'ui_message' &&
        item.source === 'protocol_leak_filtered',
    ),
    true,
  )
})

test('text fallback rejects trailing prose after a shell payload', () => {
  const items = normalizeResponsesOutputToTurnItems([
    {
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: 'to=shell {"command":"pwd"} 然后告诉我结果',
        },
      ],
    },
  ])

  assert.equal(items.some(item => item.kind === 'tool_call'), false)
  assert.equal(items.some(item => item.kind === 'local_shell_call'), false)
  assert.equal(
    items.some(
      item =>
        item.kind === 'ui_message' &&
        item.source === 'protocol_leak_filtered',
    ),
    true,
  )
})

test('text fallback rejects markdown fenced protocol snippets', () => {
  const items = normalizeResponsesOutputToTurnItems([
    {
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: '```\\nto=shell {"command":"pwd"}\\n```',
        },
      ],
    },
  ])

  assert.equal(items.some(item => item.kind === 'tool_call'), false)
  assert.equal(
    items.some(
      item =>
        item.kind === 'final_answer' &&
        item.text.includes('to=shell {"command":"pwd"}'),
    ),
    false,
  )
  assert.equal(
    items.some(
      item =>
        item.kind === 'ui_message' &&
        item.source === 'protocol_leak_filtered',
    ),
    true,
  )
})

test('exact quoted code payload only executes in isolated debug mode', () => {
  const filteredItems = normalizeResponsesOutputToTurnItems([
    {
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: 'code:"pwd"',
        },
      ],
    },
  ])

  assert.equal(filteredItems.some(item => item.kind === 'tool_call'), false)
  assert.equal(
    filteredItems.some(
      item =>
        item.kind === 'ui_message' &&
        item.source === 'text_fallback_filtered',
    ),
    true,
  )

  const debugItems = normalizeResponsesOutputToTurnItems(
    [
      {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: 'code:"pwd"',
          },
        ],
      },
    ],
    { allowTextFallbackToolCall: true },
  )

  assert.equal(debugItems.some(item => item.kind === 'tool_call'), true)
  assert.equal(debugItems.some(item => item.kind === 'local_shell_call'), true)
})

test('commentary messages stay visible without becoming final answers', () => {
  const items = normalizeResponsesOutputToTurnItems([
    {
      type: 'message',
      role: 'assistant',
      phase: 'commentary',
      content: [
        {
          type: 'output_text',
          text: "Let's inspect the current directory before summarizing.",
        },
      ],
    },
  ])

  assert.equal(items.some(item => item.kind === 'final_answer'), false)
  assert.equal(
    items.some(
      item =>
        item.kind === 'ui_message' &&
        item.level === 'info' &&
        item.source === 'commentary' &&
        item.text.includes('inspect the current directory'),
    ),
    true,
  )
})

test('shell function_call is bridged back into the existing Bash execution chain', () => {
  const items = normalizeResponsesOutputToTurnItems([
    {
      type: 'function_call',
      id: 'fc-shell-1',
      call_id: 'shell-fn-1',
      name: 'shell',
      arguments: JSON.stringify({
        command: ['bash', '-lc', 'pwd'],
        workdir: '/tmp/project',
        timeout_ms: 1200,
      }),
    },
  ])

  assert.equal(
    items.some(
      item =>
        item.kind === 'tool_call' &&
        item.toolUseId === 'shell-fn-1' &&
        item.toolName === 'Bash' &&
        item.input.command === 'cd /tmp/project && pwd' &&
        item.input.timeout === 1200,
    ),
    true,
  )
  assert.equal(
    items.some(
      item =>
        item.kind === 'local_shell_call' &&
        item.toolUseId === 'shell-fn-1' &&
        item.command === 'cd /tmp/project && pwd' &&
        item.phase === 'requested',
    ),
    true,
  )
})

test('native local_shell_call is bridged back into the existing Bash execution chain', () => {
  const items = normalizeResponsesOutputToTurnItems([
    {
      type: 'local_shell_call',
      call_id: 'shell-1',
      status: 'completed',
      action: {
        type: 'exec',
        command: ['bash', '-lc', 'pwd'],
        timeout_ms: 1200,
      },
    },
  ])

  assert.equal(
    items.some(
      item =>
        item.kind === 'tool_call' &&
        item.toolUseId === 'shell-1' &&
        item.toolName === 'Bash' &&
        item.input.command === 'pwd' &&
        item.input.timeout === 1200,
    ),
    true,
  )
  assert.equal(
    items.some(
      item =>
        item.kind === 'local_shell_call' &&
        item.toolUseId === 'shell-1' &&
        item.command === 'pwd' &&
        item.phase === 'requested',
    ),
    true,
  )
})

test('native shell_call and shell_call_output are bridged into the existing Bash execution chain', () => {
  const items = normalizeResponsesOutputToTurnItems([
    {
      type: 'shell_call',
      call_id: 'shell-2',
      status: 'completed',
      action: {
        commands: ['pwd'],
        timeout_ms: 1200,
      },
    },
    {
      type: 'shell_call_output',
      call_id: 'shell-2',
      output: [
        {
          stdout: '/tmp/workspace',
          stderr: '',
          outcome: {
            type: 'exit',
            exit_code: 0,
          },
        },
      ],
    },
  ])

  assert.equal(
    items.some(
      item =>
        item.kind === 'tool_call' &&
        item.toolUseId === 'shell-2' &&
        item.toolName === 'Bash' &&
        item.input.command === 'pwd' &&
        item.input.timeout === 1200,
    ),
    true,
  )
  assert.equal(
    items.some(
      item =>
        item.kind === 'execution_result' &&
        item.toolUseId === 'shell-2' &&
        item.toolName === 'Bash' &&
        item.status === 'success' &&
        item.outputText === '/tmp/workspace',
    ),
    true,
  )
})

test('native local_shell_call validates missing call_id and unsupported actions', () => {
  const missingCallIdItems = normalizeResponsesOutputToTurnItems([
    {
      type: 'local_shell_call',
      status: 'completed',
      action: {
        type: 'exec',
        command: ['bash', '-lc', 'pwd'],
      },
    },
  ])

  assert.equal(
    missingCallIdItems.some(
      item =>
        item.kind === 'ui_message' &&
        item.source === 'invalid_local_shell_call_filtered' &&
        item.text.includes('missing call_id'),
    ),
    true,
  )

  const unsupportedActionItems = normalizeResponsesOutputToTurnItems([
    {
      type: 'local_shell_call',
      call_id: 'shell-bad-1',
      status: 'completed',
      action: {
        type: 'exec',
        command: [],
      },
    },
  ])

  assert.equal(
    unsupportedActionItems.some(
      item =>
        item.kind === 'ui_message' &&
        item.source === 'invalid_local_shell_call_filtered' &&
        item.text.includes('unsupported action'),
    ),
    true,
  )
})

test('web search call emits a visible progress message', () => {
  const items = normalizeResponsesOutputToTurnItems([
    {
      type: 'web_search_call',
      status: 'in_progress',
      action: {
        type: 'search',
        query: 'codex cli tool calling',
      },
    },
  ])

  assert.equal(
    items.some(
      item =>
        item.kind === 'ui_message' &&
        item.source === 'web_search_call' &&
        item.text.includes('codex cli tool calling'),
    ),
    true,
  )
})

test('compaction summary alias is preserved as an opaque compaction item', () => {
  const items = normalizeResponsesOutputToTurnItems([
    {
      type: 'compaction_summary',
      encrypted_content: 'ENCRYPTED_COMPACTION_SUMMARY',
    },
  ] as Parameters<typeof normalizeResponsesOutputToTurnItems>[0])

  assert.equal(items.some(item => item.kind === 'opaque_compaction'), true)
})

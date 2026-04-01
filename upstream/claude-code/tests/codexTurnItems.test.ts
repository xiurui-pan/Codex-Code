import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeResponsesOutputToTurnItems } from '../src/services/api/codexTurnItems.js'

test('text fallback shell call stays parseable but marked as fallback', () => {
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

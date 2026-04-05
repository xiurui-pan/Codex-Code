import test from 'node:test'
import assert from 'node:assert/strict'
import { getCompactSummaryText } from '../src/services/compact/summaryText.js'

test('compact summary prefers model turn-item final answer text over assistant shell text', () => {
  const text = getCompactSummaryText({
    assistantText: 'legacy assistant shell text',
    modelTurnItems: [
      {
        kind: 'final_answer',
        provider: 'custom',
        text: 'turn item summary',
        source: 'message_output',
      },
    ],
  })

  assert.equal(text, 'turn item summary')
})

test('compact summary falls back to assistant text when turn items have no final answer', () => {
  const text = getCompactSummaryText({
    assistantText: 'legacy assistant shell text',
    modelTurnItems: [
      {
        kind: 'tool_call',
        provider: 'custom',
        toolUseId: 'tool-1',
        toolName: 'Bash',
        input: { command: 'pwd' },
        source: 'structured',
      },
    ],
  })

  assert.equal(text, 'legacy assistant shell text')
})

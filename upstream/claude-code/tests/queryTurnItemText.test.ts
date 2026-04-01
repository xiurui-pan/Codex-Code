import test from 'node:test'
import assert from 'node:assert/strict'
import { getPlainAssistantTextFromTurnItems } from '../src/query/turnItemText.js'

test('query turn-item path returns plain assistant text when there is no tool call', () => {
  const text = getPlainAssistantTextFromTurnItems([
    {
      kind: 'final_answer',
      provider: 'custom',
      text: 'plain reply',
      source: 'message_output',
    },
  ])

  assert.equal(text, 'plain reply')
})

test('query turn-item path does not turn tool calls into plain assistant text', () => {
  const text = getPlainAssistantTextFromTurnItems([
    {
      kind: 'tool_call',
      provider: 'custom',
      toolUseId: 'tool-1',
      toolName: 'Bash',
      input: { command: 'pwd' },
      source: 'structured',
    },
    {
      kind: 'final_answer',
      provider: 'custom',
      text: 'should stay off the plain-text path',
      source: 'message_output',
    },
  ])

  assert.equal(text, null)
})

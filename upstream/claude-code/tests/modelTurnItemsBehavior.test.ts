import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPreferredAssistantMessageFromTurnItems,
} from '../src/services/api/modelTurnItems.js'

test('preferred assistant message uses plain text content when no tool call exists', () => {
  const message = buildPreferredAssistantMessageFromTurnItems([
    {
      kind: 'final_answer',
      provider: 'custom',
      text: 'plain reply',
      source: 'message_output',
    },
  ])

  assert.deepEqual(message.message.content, [
    {
      type: 'text',
      text: 'plain reply',
    },
  ])
})

test('preferred assistant message keeps tool_use blocks when turn items contain a tool call', () => {
  const message = buildPreferredAssistantMessageFromTurnItems([
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
      text: 'done',
      source: 'message_output',
    },
  ])

  assert.equal(message.message.content.some(block => block.type === 'tool_use'), true)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAssistantMessageFromPreferredContent,
  resolvePreferredAssistantTurnContent,
} from '../src/services/api/modelTurnItems.js'

test('preferred assistant content resolves plain text when no tool call exists', () => {
  const preferred = resolvePreferredAssistantTurnContent([
    {
      kind: 'final_answer',
      provider: 'custom',
      text: 'plain reply',
      source: 'message_output',
    },
  ])

  assert.equal(preferred.kind, 'text')
  assert.equal(preferred.text, 'plain reply')

  const message = buildAssistantMessageFromPreferredContent(preferred)
  assert.deepEqual(message.message.content, [
    {
      type: 'text',
      text: 'plain reply',
    },
  ])
})

test('preferred assistant content keeps tool_use blocks when turn items contain a tool call', () => {
  const preferred = resolvePreferredAssistantTurnContent([
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

  assert.equal(preferred.kind, 'tool_use_message')
  const message = buildAssistantMessageFromPreferredContent(preferred)
  assert.equal(message.message.content.some(block => block.type === 'tool_use'), true)
})

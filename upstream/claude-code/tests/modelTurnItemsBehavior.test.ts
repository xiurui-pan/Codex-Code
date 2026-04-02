import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createPreferredAssistantResponsePayloadFromTurnItems,
  createSyntheticPayloadFromTurnItems,
  createSyntheticAssistantPayloadFromPreferredContent,
  preferredAssistantResponsePayloadHasContent,
  resolvePreferredAssistantTurnContent,
} from '../src/services/api/modelTurnItems.js'
import {
  buildAssistantMessageFromTurnItems,
  createAssistantMessageFromSyntheticPayload,
  maybeCreateAssistantMessageFromPreferredAssistantResponsePayload,
} from '../src/services/api/assistantEnvelope.js'

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

  const payload = createSyntheticAssistantPayloadFromPreferredContent(preferred)
  assert.deepEqual(payload.content, [
    {
      type: 'text',
      text: 'plain reply',
    },
  ])

  const message = createAssistantMessageFromSyntheticPayload(payload)
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
  const payload = createSyntheticAssistantPayloadFromPreferredContent(preferred)
  assert.equal(payload.content.some(block => block.type === 'tool_use'), true)

  const message = createAssistantMessageFromSyntheticPayload(payload)
  assert.equal(message.message.content.some(block => block.type === 'tool_use'), true)
})

test('turn items can now produce a synthetic payload before the assistant shell wrapper', () => {
  const payload = createSyntheticPayloadFromTurnItems([
    {
      kind: 'final_answer',
      provider: 'custom',
      text: 'payload first',
      source: 'message_output',
    },
  ])

  assert.deepEqual(payload, {
    content: [
      {
        type: 'text',
        text: 'payload first',
      },
    ],
    modelTurnItems: [
      {
        kind: 'final_answer',
        provider: 'custom',
        text: 'payload first',
        source: 'message_output',
      },
    ],
  })
})

test('preferred response payload keeps empty distinct from an empty assistant shell', () => {
  const payload = createPreferredAssistantResponsePayloadFromTurnItems([
    {
      kind: 'ui_message',
      provider: 'custom',
      level: 'info',
      text: 'skip me',
      source: 'test',
    },
  ])

  assert.equal(payload.kind, 'empty')
  assert.equal(preferredAssistantResponsePayloadHasContent(payload), false)
  assert.equal(
    maybeCreateAssistantMessageFromPreferredAssistantResponsePayload(payload),
    null,
  )
})

test('buildAssistantMessageFromTurnItems follows the same direct preferred path for plain text turn items', () => {
  const message = buildAssistantMessageFromTurnItems([
    {
      kind: 'final_answer',
      provider: 'custom',
      text: 'direct preferred path',
      source: 'message_output',
    },
  ])

  assert.deepEqual(message.message.content, [
    {
      type: 'text',
      text: 'direct preferred path',
    },
  ])
  assert.deepEqual(message.modelTurnItems, [
    {
      kind: 'final_answer',
      provider: 'custom',
      text: 'direct preferred path',
      source: 'message_output',
    },
  ])
})

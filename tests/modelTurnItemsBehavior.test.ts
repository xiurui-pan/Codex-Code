import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSDKExecutionItemMessages,
  createSystemMessageFromModelTurnItem,
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

test('warning ui messages are surfaced as system messages for TUI visibility', () => {
  const message = createSystemMessageFromModelTurnItem({
    kind: 'ui_message',
    provider: 'custom',
    level: 'warn',
    text: 'Provider emitted a text fallback tool call; filtered out of the execution path.',
    source: 'text_fallback_filtered',
  })

  assert.equal(message?.level, 'warn')
  assert.equal(message?.content.includes('text fallback tool call'), true)
})

test('tool start ui messages are hidden from normal TUI output', () => {
  const message = createSystemMessageFromModelTurnItem({
    kind: 'ui_message',
    provider: 'custom',
    level: 'info',
    text: '准备调用工具: Read',
    source: 'tool_call_started',
  })

  assert.equal(message, null)
})

test('tool output bookkeeping messages stay hidden from normal TUI output', () => {
  const message = createSystemMessageFromModelTurnItem({
    kind: 'tool_output',
    provider: 'custom',
    toolUseId: 'tool-1',
    outputText: 'ok',
    source: 'tool_execution',
  })

  assert.equal(message, null)
})

test('commentary info ui messages are emitted into SDK execution item stream', () => {
  const items = buildSDKExecutionItemMessages(
    [
      {
        kind: 'ui_message',
        provider: 'custom',
        level: 'info',
        text: 'I am checking the project structure before editing.',
        source: 'commentary',
      },
    ],
    'session-1',
  )

  assert.deepEqual(
    items.map(item => item.item_kind),
    ['ui_message'],
  )
})

test('commentary info ui messages that render in the transcript get their own uuid', () => {
  const message = createSystemMessageFromModelTurnItem({
    kind: 'ui_message',
    provider: 'custom',
    level: 'info',
    text: 'I am checking the project structure before editing.',
    source: 'commentary',
  })

  assert.equal(typeof message?.uuid, 'string')
  assert.equal(typeof message?.timestamp, 'string')
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

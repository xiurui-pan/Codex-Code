import assert from 'node:assert/strict'
import test from 'node:test'
import { createAssistantMessage, normalizeMessagesForAPI, filterOrphanedThinkingOnlyMessages } from '../src/utils/messages.js'

test('transcript-only thinking assistants survive local filtering', () => {
  const thinkingMessage = createAssistantMessage({
    content: [{ type: 'thinking', thinking: 'Checking files' }] as never,
    isVisibleInTranscriptOnly: true,
  })

  const filtered = filterOrphanedThinkingOnlyMessages([thinkingMessage])

  assert.equal(filtered.length, 1)
  assert.equal(filtered[0]?.type, 'assistant')
  assert.equal(filtered[0]?.isVisibleInTranscriptOnly, true)
})

test('normalizeMessagesForAPI excludes transcript-only thinking assistants', () => {
  const thinkingMessage = createAssistantMessage({
    content: [{ type: 'thinking', thinking: 'Checking files' }] as never,
    isVisibleInTranscriptOnly: true,
  })
  const finalMessage = createAssistantMessage({
    content: 'Done',
  })

  const normalized = normalizeMessagesForAPI([thinkingMessage, finalMessage], [])

  assert.equal(normalized.length, 1)
  assert.equal(normalized[0]?.type, 'assistant')
  assert.deepEqual(normalized[0]?.message.content, [
    { type: 'text', text: 'Done' },
  ])
})

test('transcript-only thinking assistants can keep the real model name', () => {
  const thinkingMessage = createAssistantMessage({
    content: [{ type: 'thinking', thinking: 'Checking files' }] as never,
    isVisibleInTranscriptOnly: true,
    model: 'gpt-5.4',
  })

  assert.equal(thinkingMessage.message.model, 'gpt-5.4')
})

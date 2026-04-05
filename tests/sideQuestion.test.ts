import assert from 'node:assert/strict'
import test from 'node:test'
import { extractSideQuestionResponse } from '../src/utils/sideQuestion.js'
import type { Message } from '../src/types/message.js'

function assistantMessage(
  uuid: string,
  content: Array<Record<string, unknown>>,
  stopReason: string | null = 'end_turn',
): Message {
  return {
    uuid,
    type: 'assistant',
    message: {
      role: 'assistant',
      content,
      stop_reason: stopReason,
    },
  } as Message
}

test('side question extracts text from assistant content blocks', () => {
  const messages: Message[] = [
    assistantMessage('a1', [{ type: 'thinking', thinking: '...' }]),
    assistantMessage('a2', [{ type: 'text', text: 'answer from /btw' }]),
  ]

  const result = extractSideQuestionResponse(messages)

  assert.equal(result.status, 'answered')
  assert.equal(result.response, 'answer from /btw')
})

test('side question marks tool-use-only output as no_text', () => {
  const messages: Message[] = [
    assistantMessage('a1', [
      { type: 'thinking', thinking: 'I will run a tool' },
      { type: 'tool_use', id: 'tool_1', name: 'Read', input: {} },
    ]),
  ]

  const result = extractSideQuestionResponse(messages)

  assert.equal(result.status, 'no_text')
  assert.match(result.response, /returned no text/i)
  assert.match(result.response, /Read/)
})

test('side question surfaces provider api_error as provider_error status', () => {
  const messages: Message[] = [
    {
      uuid: 's1',
      type: 'system',
      subtype: 'api_error',
      error: new Error('provider exploded'),
    } as Message,
  ]

  const result = extractSideQuestionResponse(messages)

  assert.equal(result.status, 'provider_error')
  assert.match(result.response, /provider error/i)
})

test('side question reports explicit no_text when no assistant output exists', () => {
  const messages: Message[] = [
    {
      uuid: 'p1',
      type: 'progress',
      data: { type: 'agent_progress', message: 'working' },
    } as Message,
  ]

  const result = extractSideQuestionResponse(messages)

  assert.equal(result.status, 'no_text')
  assert.match(result.response, /no assistant output/i)
})

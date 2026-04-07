import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createAssistantMessage,
  createUserMessage,
} from '../src/utils/messages.js'
import {
  getDisplayContextTokenCount,
  getTokenCountFromUsage,
  tokenCountWithEstimation,
} from '../src/utils/tokens.js'

test('display context token count matches autocompact counting when messages were added after the last usage snapshot', () => {
  const assistantBase = createAssistantMessage({
    content: 'done',
    usage: {
      input_tokens: 1_000,
      output_tokens: 200,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  })
  const assistant = {
    ...assistantBase,
    message: {
      ...assistantBase.message,
      model: 'gpt-5.4',
    },
  }
  const trailingUserMessage = createUserMessage({
    content:
      'Please continue with another detailed implementation step and explain the next edits in more detail.',
  })

  const messages = [assistant, trailingUserMessage]
  const usageOnlyTokens = getTokenCountFromUsage(assistant.message.usage)
  const autocompactTokens = tokenCountWithEstimation(messages)
  const displayTokens = getDisplayContextTokenCount(messages, {
    includeRestoredTotals: false,
  })

  assert.ok(autocompactTokens > usageOnlyTokens)
  assert.equal(displayTokens, autocompactTokens)
})

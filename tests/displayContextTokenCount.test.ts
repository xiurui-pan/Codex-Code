import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import {
  createAssistantMessage,
  createUserMessage,
} from '../src/utils/messages.js'
import {
  getDisplayContextTokenCount,
  getTokenCountFromUsage,
  tokenCountWithEstimation,
} from '../src/utils/tokens.js'

const ORIGINAL_CODEX_PROVIDER = process.env.CODEX_CODE_USE_CODEX_PROVIDER

afterEach(() => {
  if (ORIGINAL_CODEX_PROVIDER === undefined) {
    delete process.env.CODEX_CODE_USE_CODEX_PROVIDER
  } else {
    process.env.CODEX_CODE_USE_CODEX_PROVIDER = ORIGINAL_CODEX_PROVIDER
  }
})

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

test('display context token count includes replay-only responses compaction history', () => {
  process.env.CODEX_CODE_USE_CODEX_PROVIDER = '1'

  const compactReplayMessage = createUserMessage({
    content: [],
    isMeta: true,
    modelTurnItems: [
      {
        kind: 'raw_model_output',
        provider: 'custom',
        itemType: 'message',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'kept compacted user turn' }],
        },
      },
      {
        kind: 'opaque_compaction',
        provider: 'custom',
        itemType: 'compaction',
        payload: {
          type: 'compaction',
          encrypted_content: 'ENCRYPTED_COMPACTION_SUMMARY',
        },
      },
    ],
  })

  const estimatedTokens = tokenCountWithEstimation([compactReplayMessage])
  const displayTokens = getDisplayContextTokenCount([compactReplayMessage], {
    includeRestoredTotals: false,
  })

  assert.ok(estimatedTokens > 0)
  assert.equal(displayTokens, estimatedTokens)
})

test('display context token count ignores zero-usage assistant snapshots and falls back to message estimation', () => {
  const restoredAssistantBase = createAssistantMessage({
    content: 'done',
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  })
  const restoredAssistant = {
    ...restoredAssistantBase,
    message: {
      ...restoredAssistantBase.message,
      model: 'gpt-5.4',
    },
  }
  const restoredUser = createUserMessage({
    content: 'resume me for compact',
  })

  const estimatedTokens = tokenCountWithEstimation([
    restoredUser,
    restoredAssistant,
  ])
  const displayTokens = getDisplayContextTokenCount(
    [restoredUser, restoredAssistant],
    {
      includeRestoredTotals: false,
    },
  )

  assert.ok(estimatedTokens > 0)
  assert.equal(displayTokens, estimatedTokens)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPostCompactMessages } from '../src/services/compact/compact.js'
import {
  createAssistantMessage,
  createCompactBoundaryMessage,
  createUserMessage,
} from '../src/utils/messages.js'
import { tokenCountWithEstimation } from '../src/utils/tokens.js'

test('post-compact preserved assistant messages clear stale usage before the next autocompact check', () => {
  const preservedAssistantBase = createAssistantMessage({
    content: 'read the saved test output and continue',
    usage: {
      input_tokens: 229_056,
      output_tokens: 233,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 110_208,
      server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
      service_tier: null,
      cache_creation: {
        ephemeral_1h_input_tokens: 0,
        ephemeral_5m_input_tokens: 0,
      },
      inference_geo: null,
      iterations: [
        {
          input_tokens: 229_056,
          output_tokens: 233,
        },
      ],
      speed: null,
    },
  })
  const preservedAssistant = {
    ...preservedAssistantBase,
    message: {
      ...preservedAssistantBase.message,
      model: 'gpt-5.4',
    },
  }
  const preservedToolResult = createUserMessage({
    content:
      'ok 1 - preserved output\nok 2 - preserved output\nok 3 - preserved output',
  })

  assert.ok(
    tokenCountWithEstimation([preservedAssistant, preservedToolResult]) >
      200_000,
  )

  const postCompactMessages = buildPostCompactMessages({
    boundaryMarker: createCompactBoundaryMessage('auto', 229_289),
    summaryMessages: [
      createUserMessage({
        content: 'This session is being continued from a previous conversation.',
        isCompactSummary: true,
        isVisibleInTranscriptOnly: true,
      }),
    ],
    messagesToKeep: [preservedAssistant, preservedToolResult],
    attachments: [],
    hookResults: [],
    preCompactTokenCount: 229_289,
    postCompactTokenCount: 0,
    truePostCompactTokenCount: 0,
  })

  const keptAssistant = postCompactMessages.find(
    message => message.uuid === preservedAssistant.uuid,
  )
  if (!keptAssistant || keptAssistant.type !== 'assistant') {
    throw new Error('expected preserved assistant message to survive compaction')
  }

  assert.equal(keptAssistant.message.usage.input_tokens, 0)
  assert.equal(keptAssistant.message.usage.output_tokens, 0)
  assert.equal(keptAssistant.message.usage.cache_creation_input_tokens, 0)
  assert.equal(keptAssistant.message.usage.cache_read_input_tokens, 0)
  assert.deepEqual(keptAssistant.message.usage.iterations, [])

  assert.ok(tokenCountWithEstimation(postCompactMessages) < 5_000)
})

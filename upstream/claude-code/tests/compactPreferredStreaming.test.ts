import test from 'node:test'
import assert from 'node:assert/strict'
import {
  accumulatePreferredStreamingEvent,
  finalizePreferredStreamingAggregation,
} from '../src/services/compact/preferredStreaming.js'
import type { ModelTurnItem } from '../src/services/api/modelTurnItems.js'

test('compact preferred streaming aggregation merges multiple preferred chunks into one final assistant message', () => {
  let aggregatedItems: ModelTurnItem[] = []

  const first = accumulatePreferredStreamingEvent(aggregatedItems, {
    kind: 'preferred_content',
    preferred: {
      kind: 'text',
      text: 'first part',
      renderableItems: [
        {
          kind: 'final_answer',
          provider: 'custom',
          text: 'first part',
          source: 'message_output',
        },
      ],
    },
  })

  assert.equal(first.hasStartedStreaming, true)
  assert.equal(first.responseLengthDelta, 'first part'.length)
  assert.equal(first.immediateResponse, null)
  aggregatedItems = first.aggregatedItems

  const second = accumulatePreferredStreamingEvent(aggregatedItems, {
    kind: 'preferred_content',
    preferred: {
      kind: 'text',
      text: 'second part',
      renderableItems: [
        {
          kind: 'final_answer',
          provider: 'custom',
          text: 'second part',
          source: 'message_output',
        },
      ],
    },
  })

  aggregatedItems = second.aggregatedItems
  const finalMessage = finalizePreferredStreamingAggregation(aggregatedItems)
  assert.equal(finalMessage?.message.content[0]?.type, 'text')
  assert.equal(finalMessage?.message.content[0]?.text, 'first part\nsecond part')
  assert.equal(finalMessage?.modelTurnItems?.length, 2)
})

test('compact preferred streaming aggregation turns api_error into assistant api error message', () => {
  const result = accumulatePreferredStreamingEvent([], {
    kind: 'api_error',
    errorMessage: 'compact failed',
  })

  assert.equal(result.hasStartedStreaming, false)
  assert.equal(result.responseLengthDelta, 0)
  assert.equal(result.immediateResponse?.type, 'assistant')
  assert.equal(result.immediateResponse?.isApiErrorMessage, true)
  assert.equal(result.immediateResponse?.message.content[0]?.type, 'text')
  assert.equal(result.immediateResponse?.message.content[0]?.text, 'compact failed')
})

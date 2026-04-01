import test from 'node:test'
import assert from 'node:assert/strict'
import {
  accumulatePreferredStreamingEvent,
  finalizePreferredStreamingAggregationPayload,
  finalizePreferredStreamingAggregation,
} from '../src/services/compact/preferredStreaming.js'
import { preferredTurnResultToPayload } from '../src/services/api/preferredAssistantResponse.js'
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
  assert.equal(first.immediatePayload, null)
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
  const expected = preferredTurnResultToPayload({
    kind: 'api_error',
    errorMessage: 'compact failed',
  })

  assert.equal(result.hasStartedStreaming, false)
  assert.equal(result.responseLengthDelta, 0)
  assert.deepEqual(result.immediatePayload, expected)
  assert.equal(result.immediatePayload?.kind, 'api_error')
})

test('compact preferred streaming finalization can stop at payload before assistant shell wrapping', () => {
  const payload = finalizePreferredStreamingAggregationPayload([
    {
      kind: 'final_answer',
      provider: 'custom',
      text: 'payload result',
      source: 'message_output',
    },
  ])

  assert.equal(payload?.kind, 'synthetic_payload')
  assert.equal(payload?.payload.content[0]?.type, 'text')
  assert.equal(payload?.payload.content[0]?.text, 'payload result')
})

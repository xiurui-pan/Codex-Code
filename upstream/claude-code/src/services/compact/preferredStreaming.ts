import type { AssistantMessage } from '../../types/message.js'
import type { PreferredAssistantTurnResult } from '../api/model.js'
import {
  createAssistantMessageFromSyntheticPayload,
  createSyntheticAssistantPayloadFromPreferredContent,
  resolvePreferredAssistantTurnContent,
  type ModelTurnItem,
} from '../api/modelTurnItems.js'

export type PreferredStreamingAggregation = {
  hasStartedStreaming: boolean
  responseLengthDelta: number
  aggregatedItems: ModelTurnItem[]
  immediateResponse: AssistantMessage | null
}

export function accumulatePreferredStreamingEvent(
  aggregatedItems: ModelTurnItem[],
  event: PreferredAssistantTurnResult,
): PreferredStreamingAggregation {
  if (event.kind === 'api_error') {
    return {
      hasStartedStreaming: false,
      responseLengthDelta: 0,
      aggregatedItems,
      immediateResponse: {
        type: 'assistant',
        uuid: 'compact-preferred-streaming-api-error',
        timestamp: new Date().toISOString(),
        isApiErrorMessage: true,
        apiError: 'api_error',
        error: {
          type: 'api_error',
          message: event.errorMessage,
        },
        message: {
          id: 'compact-preferred-streaming-api-error',
          container: null,
          model: 'codex-synthetic',
          role: 'assistant',
          stop_reason: 'stop_sequence',
          stop_sequence: '',
          type: 'message',
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          context_management: null,
          content: [
            {
              type: 'text',
              text: event.errorMessage,
            },
          ],
        },
      },
    }
  }

  if (event.kind === 'empty') {
    return {
      hasStartedStreaming: false,
      responseLengthDelta: 0,
      aggregatedItems,
      immediateResponse: null,
    }
  }

  const nextItems = [...aggregatedItems, ...event.preferred.renderableItems]
  const payload = createSyntheticAssistantPayloadFromPreferredContent(
    event.preferred,
  )
  const responseLengthDelta = payload.content.reduce((count, block) => {
    if (block.type === 'text') {
      return count + block.text.length
    }
    return count
  }, 0)

  return {
    hasStartedStreaming: true,
    responseLengthDelta,
    aggregatedItems: nextItems,
    immediateResponse: null,
  }
}

export function finalizePreferredStreamingAggregation(
  aggregatedItems: readonly ModelTurnItem[],
): AssistantMessage | null {
  const finalPreferred = resolvePreferredAssistantTurnContent([
    ...aggregatedItems,
  ])
  if (finalPreferred.kind === 'empty') {
    return null
  }

  return createAssistantMessageFromSyntheticPayload(
    createSyntheticAssistantPayloadFromPreferredContent(finalPreferred),
  )
}

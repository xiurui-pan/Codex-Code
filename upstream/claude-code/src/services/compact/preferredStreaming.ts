import type { AssistantMessage } from '../../types/message.js'
import {
  preferredTurnResultToAssistantMessage,
  type PreferredAssistantTurnResult,
} from '../api/preferredAssistantResponse.js'
import {
  createAssistantMessageFromPreferredAssistantResponsePayload,
  createPreferredAssistantResponsePayloadFromPreferredContent,
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
      immediateResponse: preferredTurnResultToAssistantMessage(event),
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
  const payload = createPreferredAssistantResponsePayloadFromPreferredContent(
    event.preferred,
  )
  if (payload.kind !== 'synthetic_payload') {
    return {
      hasStartedStreaming: false,
      responseLengthDelta: 0,
      aggregatedItems: nextItems,
      immediateResponse: null,
    }
  }
  const responseLengthDelta = payload.payload.content.reduce((count, block) => {
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

  return createAssistantMessageFromPreferredAssistantResponsePayload(
    createPreferredAssistantResponsePayloadFromPreferredContent(finalPreferred),
  )
}

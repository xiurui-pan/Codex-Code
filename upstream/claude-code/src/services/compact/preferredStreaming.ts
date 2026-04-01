import {
  preferredTurnResultToPayload,
  type PreferredAssistantTurnResult,
} from '../api/preferredAssistantResponse.js'
import {
  createPreferredAssistantResponsePayloadFromPreferredContent,
  maybeCreateAssistantMessageFromPreferredAssistantResponsePayload,
  type PreferredAssistantResponsePayload,
  resolvePreferredAssistantTurnContent,
  type ModelTurnItem,
} from '../api/modelTurnItems.js'

export type PreferredStreamingAggregation = {
  hasStartedStreaming: boolean
  responseLengthDelta: number
  aggregatedItems: ModelTurnItem[]
  immediatePayload: PreferredAssistantResponsePayload | null
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
      immediatePayload: preferredTurnResultToPayload(event),
    }
  }

  if (event.kind === 'empty') {
    return {
      hasStartedStreaming: false,
      responseLengthDelta: 0,
      aggregatedItems,
      immediatePayload: null,
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
      immediatePayload: null,
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
    immediatePayload: null,
  }
}

export function finalizePreferredStreamingAggregationPayload(
  aggregatedItems: readonly ModelTurnItem[],
): PreferredAssistantResponsePayload | null {
  const finalPreferred = resolvePreferredAssistantTurnContent([
    ...aggregatedItems,
  ])
  if (finalPreferred.kind === 'empty') {
    return null
  }

  return createPreferredAssistantResponsePayloadFromPreferredContent(
    finalPreferred,
  )
}

export function finalizePreferredStreamingAggregation(
  aggregatedItems: readonly ModelTurnItem[],
) {
  return maybeCreateAssistantMessageFromPreferredAssistantResponsePayload(
    finalizePreferredStreamingAggregationPayload(aggregatedItems) ?? {
      kind: 'empty',
    },
  )
}

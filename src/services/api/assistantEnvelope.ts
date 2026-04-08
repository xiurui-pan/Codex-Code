import type { ContentBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import { randomUUID } from 'crypto'
import { NO_CONTENT_MESSAGE } from '../../constants/messages.js'
import type { AssistantMessage } from '../../types/message.js'
import {
  createPreferredAssistantResponsePayloadFromPreferredContent,
  isEmptyPreferredAssistantResponsePayload,
  type ModelTurnItem,
  type PreferredAssistantResponsePayload,
  type PreferredAssistantTurnContent,
  type SyntheticAssistantPayload,
  resolvePreferredAssistantTurnContent,
} from './modelTurnItems.js'

function createSyntheticAssistantMessage(
  content: ContentBlock[],
  model = 'codex-synthetic',
): AssistantMessage {
  return {
    type: 'assistant',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    message: {
      id: randomUUID(),
      container: null,
      model,
      role: 'assistant',
      stop_reason: 'stop_sequence',
      stop_sequence: '',
      type: 'message',
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
        service_tier: null,
        cache_creation: {
          ephemeral_1h_input_tokens: 0,
          ephemeral_5m_input_tokens: 0,
        },
        inference_geo: null,
        iterations: null,
        speed: null,
      },
      content,
      context_management: null,
    },
  }
}

export function createAssistantMessageFromSyntheticPayload(
  payload: SyntheticAssistantPayload,
  model?: string,
): AssistantMessage {
  const message = createSyntheticAssistantMessage(payload.content, model)
  if (payload.modelTurnItems.length > 0) {
    message.modelTurnItems = payload.modelTurnItems
  }
  return message
}

export function createAssistantMessageFromPreferredAssistantResponsePayload(
  payload: PreferredAssistantResponsePayload,
  model?: string,
): AssistantMessage {
  if (payload.kind === 'api_error') {
    return createSyntheticAssistantApiErrorMessage(payload.errorMessage)
  }

  if (payload.kind === 'empty') {
    return createAssistantMessageFromSyntheticPayload({
      content: [],
      modelTurnItems: [],
    }, model)
  }

  return createAssistantMessageFromSyntheticPayload(payload.payload, model)
}

export function maybeCreateAssistantMessageFromPreferredAssistantResponsePayload(
  payload: PreferredAssistantResponsePayload,
  model?: string,
): AssistantMessage | null {
  if (isEmptyPreferredAssistantResponsePayload(payload)) {
    return null
  }

  return createAssistantMessageFromPreferredAssistantResponsePayload(
    payload,
    model,
  )
}

export function buildAssistantMessageFromPreferredContent(
  preferred: PreferredAssistantTurnContent,
): AssistantMessage {
  return createAssistantMessageFromPreferredAssistantResponsePayload(
    createPreferredAssistantResponsePayloadFromPreferredContent(preferred),
  )
}

export function buildPreferredAssistantMessageFromTurnItems(
  items: ModelTurnItem[],
): AssistantMessage {
  return createAssistantMessageFromPreferredAssistantResponsePayload(
    createPreferredAssistantResponsePayloadFromPreferredContent(
      resolvePreferredAssistantTurnContent(items),
    ),
  )
}

export function buildAssistantMessageFromTurnItems(
  items: ModelTurnItem[],
): AssistantMessage {
  return buildPreferredAssistantMessageFromTurnItems(items)
}

export function mergeStreamedAssistantMessages(
  messages: readonly AssistantMessage[],
): AssistantMessage | null {
  if (messages.length === 0) {
    return null
  }

  const lastMessage = messages.at(-1) ?? null
  if (!lastMessage) {
    return null
  }

  if (lastMessage.isApiErrorMessage) {
    return lastMessage
  }

  const aggregatedTurnItems = messages.flatMap(
    message => message.modelTurnItems ?? [],
  )
  if (aggregatedTurnItems.length === 0) {
    return lastMessage
  }

  return buildPreferredAssistantMessageFromTurnItems(aggregatedTurnItems)
}

function createSyntheticAssistantApiErrorMessage(
  errorMessage: string,
): AssistantMessage {
  const message = createSyntheticAssistantMessage([
    {
      type: 'text',
      text: errorMessage === '' ? NO_CONTENT_MESSAGE : errorMessage,
    },
  ])
  message.isApiErrorMessage = true
  message.apiError = 'api_error'
  message.error = {
    type: 'api_error',
    message: errorMessage,
  }
  return message
}

import type { AssistantMessage } from '../../types/message.js'
import {
  createPreferredAssistantResponsePayloadFromPreferredContent,
  type PreferredAssistantResponsePayload,
  type PreferredAssistantTurnContent,
} from './modelTurnItems.js'
import { createAssistantMessageFromPreferredAssistantResponsePayload } from './assistantEnvelope.js'

export type PreferredAssistantTurnResult =
  | {
      kind: 'api_error'
      errorMessage: string
    }
  | {
      kind: 'preferred_content'
      preferred: PreferredAssistantTurnContent
    }
  | {
      kind: 'empty'
    }

export function preferredTurnResultToPayload(
  result: PreferredAssistantTurnResult,
): PreferredAssistantResponsePayload {
  if (result.kind === 'api_error') {
    return {
      kind: 'api_error',
      errorMessage: result.errorMessage,
    }
  }

  if (result.kind === 'empty') {
    return { kind: 'empty' }
  }

  return createPreferredAssistantResponsePayloadFromPreferredContent(
    result.preferred,
  )
}

export function preferredTurnResultToAssistantMessage(
  result: PreferredAssistantTurnResult,
): AssistantMessage | null {
  const payload = preferredTurnResultToPayload(result)
  return payload.kind === 'empty'
    ? null
    : createAssistantMessageFromPreferredAssistantResponsePayload(payload)
}

export function createAssistantMessageFromApiErrorText(
  errorMessage: string,
): AssistantMessage {
  return createAssistantMessageFromPreferredAssistantResponsePayload({
    kind: 'api_error',
    errorMessage,
  })
}

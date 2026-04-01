import { randomUUID } from 'crypto'
import type { SDKControlPermissionRequest } from '../entrypoints/sdk/controlTypes.js'
import type { AssistantMessage } from '../types/message.js'
import {
  createAssistantMessageFromSyntheticPayload,
  type SyntheticAssistantPayload,
} from '../services/api/modelTurnItems.js'

export function buildRemotePermissionPayload(
  request: SDKControlPermissionRequest,
): SyntheticAssistantPayload {
  return {
    content: [
      {
        type: 'tool_use',
        id: request.tool_use_id,
        name: request.tool_name,
        input: request.input,
      },
    ],
    modelTurnItems: [],
  }
}

export function buildRemotePermissionAssistantMessage(
  request: SDKControlPermissionRequest,
  requestId: string,
): AssistantMessage {
  const message = createAssistantMessageFromSyntheticPayload(
    buildRemotePermissionPayload(request),
  )
  message.uuid = randomUUID()
  message.timestamp = new Date().toISOString()
  message.message.id = `remote-${requestId}`
  message.message.model = ''
  message.message.stop_reason = null
  message.message.stop_sequence = null
  message.message.usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }
  message.requestId = undefined
  return message
}

import { randomUUID } from 'crypto'
import type { SDKControlPermissionRequest } from '../entrypoints/sdk/controlTypes.js'
import type { Tool } from '../Tool.js'
import type { AssistantMessage } from '../types/message.js'
import {
  createAssistantMessageFromSyntheticPayload,
  type SyntheticAssistantPayload,
} from '../services/api/modelTurnItems.js'
import { jsonStringify } from '../utils/slowOperations.js'

/**
 * Create a thin synthetic payload for remote permission requests.
 * Remote permission prompts still need an AssistantMessage at the UI edge,
 * but the payload is built first so the wrapping stays in one shared place.
 */
export function createRemotePermissionPayload(
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

/**
 * Create a synthetic AssistantMessage for remote permission requests.
 * The ToolUseConfirm type still requires an AssistantMessage at this boundary.
 */
export function createRemotePermissionAssistantMessage(
  request: SDKControlPermissionRequest,
  requestId: string,
): AssistantMessage {
  const message = createAssistantMessageFromSyntheticPayload(
    createRemotePermissionPayload(request),
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

/**
 * Create a minimal Tool stub for tools that aren't loaded locally.
 * This happens when the remote CCR has tools (e.g., MCP tools) that the
 * local CLI doesn't know about. The stub routes to FallbackPermissionRequest.
 */
export function createToolStub(toolName: string): Tool {
  return {
    name: toolName,
    inputSchema: {} as Tool['inputSchema'],
    isEnabled: () => true,
    userFacingName: () => toolName,
    renderToolUseMessage: (input: Record<string, unknown>) => {
      const entries = Object.entries(input)
      if (entries.length === 0) return ''
      return entries
        .slice(0, 3)
        .map(([key, value]) => {
          const valueStr =
            typeof value === 'string' ? value : jsonStringify(value)
          return `${key}: ${valueStr}`
        })
        .join(', ')
    },
    call: async () => ({ data: '' }),
    description: async () => '',
    prompt: () => '',
    isReadOnly: () => false,
    isMcp: false,
    needsPermissions: () => true,
  } as unknown as Tool
}

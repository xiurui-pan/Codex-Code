import type { SDKControlPermissionRequest } from '../entrypoints/sdk/controlTypes.js'
import type { Tool } from '../Tool.js'
import {
  applyRemotePermissionAssistantFields,
  buildRemotePermissionPayload,
} from './remotePermissionShape.js'
import { jsonStringify } from '../utils/slowOperations.js'

/**
 * Create a thin synthetic payload for remote permission requests.
 * Remote permission prompts still need an AssistantMessage at the UI edge,
 * but the payload is built first so the wrapping stays in one shared place.
 */
export function createRemotePermissionPayload(
  request: SDKControlPermissionRequest,
): ReturnType<typeof buildRemotePermissionPayload> {
  return buildRemotePermissionPayload(request)
}

export { applyRemotePermissionAssistantFields }

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

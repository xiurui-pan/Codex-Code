import type {
  ContentBlock,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/index.mjs'
import { randomUUID } from 'crypto'
import { NO_CONTENT_MESSAGE } from '../../constants/messages.js'
import type { AssistantMessage, SystemMessage } from '../../types/message.js'

export function getRenderableModelTurnItems(
  items: ModelTurnItem[],
): ModelTurnItem[] {
  return items.filter(
    item => item.kind !== 'raw_model_output' && item.kind !== 'ui_message',
  )
}

export function createSystemMessageFromModelTurnItem(
  item: ModelTurnItem,
): SystemMessage | null {
  switch (item.kind) {
    case 'local_shell_call':
      return {
        type: 'system',
        subtype: 'informational',
        level: 'info',
        content:
          item.phase === 'requested'
            ? `准备执行 ${item.toolName}: ${item.command}`
            : `已结束 ${item.toolName}: ${item.command || item.toolUseId}`,
        modelTurnItem: item,
      }
    case 'permission_request':
      return {
        type: 'system',
        subtype: 'informational',
        level: 'info',
        content: `等待权限确认: ${item.toolName}`,
        modelTurnItem: item,
      }
    case 'permission_decision':
      return {
        type: 'system',
        subtype: 'informational',
        level: item.decision === 'deny' ? 'warn' : 'info',
        content: `权限${item.decision === 'deny' ? '已拒绝' : item.decision === 'allow' ? '已允许' : '待确认'}: ${item.toolName}`,
        modelTurnItem: item,
      }
    case 'execution_result':
      return {
        type: 'system',
        subtype: 'informational',
        level: item.status === 'success' ? 'success' : 'warn',
        content: `${item.toolName} 执行${item.status === 'success' ? '完成' : item.status === 'denied' ? '被拒绝' : '失败'}`,
        modelTurnItem: item,
      }
    case 'tool_output':
      return {
        type: 'system',
        subtype: 'informational',
        level: 'info',
        content: `工具结果已回灌: ${item.toolUseId}`,
        modelTurnItem: item,
      }
    default:
      return null
  }
}

export function buildSDKExecutionItemMessages(
  items: readonly ModelTurnItem[] | undefined,
  sessionId: string,
): Array<{
  type: 'system'
  subtype: 'model_turn_item'
  item_kind:
    | 'local_shell_call'
    | 'permission_request'
    | 'permission_decision'
    | 'tool_output'
    | 'execution_result'
  item: ModelTurnItem
  parent_tool_use_id: string | null
  session_id: string
  uuid: string
}> {
  const output = []

  for (const item of items ?? []) {
    if (
      item.kind !== 'local_shell_call' &&
      item.kind !== 'permission_request' &&
      item.kind !== 'permission_decision' &&
      item.kind !== 'tool_output' &&
      item.kind !== 'execution_result'
    ) {
      continue
    }

    output.push({
      type: 'system' as const,
      subtype: 'model_turn_item' as const,
      item_kind: item.kind,
      item,
      parent_tool_use_id: 'toolUseId' in item ? item.toolUseId : null,
      session_id: sessionId,
      uuid: randomUUID(),
    })
  }

  return output
}

export type RawModelOutputItem = {
  kind: 'raw_model_output'
  provider: string
  itemType: string
  payload: unknown
}

export type ModelToolCallItem = {
  kind: 'tool_call'
  provider: string
  toolUseId: string
  toolName: string
  input: Record<string, unknown>
  source: 'structured' | 'text_fallback'
}

export type ModelToolResultItem = {
  kind: 'tool_output'
  provider: string
  toolUseId: string
  outputText: string
  source: 'history' | 'tool_execution'
}

export type ModelShellExecutionItem = {
  kind: 'local_shell_call'
  provider: string
  toolUseId: string
  toolName: string
  command: string
  phase: 'requested' | 'completed'
  source: 'provider' | 'history' | 'tool_execution'
}

export type ModelPermissionRequestItem = {
  kind: 'permission_request'
  provider: string
  toolUseId: string
  toolName: string
  source: 'provider' | 'history' | 'tool_execution'
}

export type ModelPermissionDecisionItem = {
  kind: 'permission_decision'
  provider: string
  toolUseId: string
  toolName: string
  decision: 'allow' | 'deny' | 'ask'
  source: 'provider' | 'history' | 'tool_execution'
  details?: Record<string, unknown>
}

export type ModelExecutionResultItem = {
  kind: 'execution_result'
  provider: string
  toolUseId: string
  toolName: string
  status: 'success' | 'error' | 'denied'
  outputText: string
  source: 'history' | 'tool_execution'
}

export type ModelFinalAnswerItem = {
  kind: 'final_answer'
  provider: string
  text: string
  source: 'message_output' | 'text_fallback' | 'message_output_filtered'
}

export type ModelUiMessageItem = {
  kind: 'ui_message'
  provider: string
  level: 'info' | 'warn' | 'error'
  text: string
  source: string
}

export type ModelTurnItem =
  | RawModelOutputItem
  | ModelToolCallItem
  | ModelToolResultItem
  | ModelShellExecutionItem
  | ModelPermissionRequestItem
  | ModelPermissionDecisionItem
  | ModelExecutionResultItem
  | ModelFinalAnswerItem
  | ModelUiMessageItem

export function buildAssistantMessageFromTurnItems(
  items: ModelTurnItem[],
): AssistantMessage {
  const content: ContentBlock[] = []
  const renderableItems = getRenderableModelTurnItems(items)

  for (const item of renderableItems) {
    if (item.kind === 'final_answer' && item.text) {
      content.push({
        type: 'text',
        text: item.text,
      })
      continue
    }

    if (item.kind === 'tool_call') {
      content.push({
        type: 'tool_use',
        id: item.toolUseId,
        name: item.toolName,
        input: item.input,
      } as ToolUseBlock)
    }
  }

  const message = createSyntheticAssistantMessage(content)
  if (renderableItems.length > 0) {
    message.modelTurnItems = renderableItems
  }
  return message
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

  return buildAssistantMessageFromTurnItems(aggregatedTurnItems)
}

function createSyntheticAssistantMessage(
  content: ContentBlock[] | string,
): AssistantMessage {
  const normalizedContent =
    typeof content === 'string'
      ? [
          {
            type: 'text' as const,
            text: content === '' ? NO_CONTENT_MESSAGE : content,
          },
        ]
      : content

  return {
    type: 'assistant',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    message: {
      id: randomUUID(),
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
      content: normalizedContent,
      context_management: null,
    },
  }
}

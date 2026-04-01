import type {
  ContentBlock,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type { AssistantMessage } from '../../types/message.js'
import { createAssistantMessage } from '../../utils/messages.js'

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
  source: 'provider' | 'history'
}

export type ModelPermissionRequestItem = {
  kind: 'permission_request'
  provider: string
  toolUseId: string
  toolName: string
  source: 'provider' | 'history'
}

export type ModelPermissionDecisionItem = {
  kind: 'permission_decision'
  provider: string
  toolUseId: string
  toolName: string
  decision: 'allow' | 'deny' | 'ask'
  source: 'provider' | 'history'
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

  for (const item of items) {
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

  return createAssistantMessage({ content })
}

import type {
  ContentBlock,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/index.mjs'
import { randomUUID } from 'crypto'
import { NO_CONTENT_MESSAGE } from '../../constants/messages.js'
import type { SystemMessage } from '../../types/message.js'

export function getRenderableModelTurnItems(
  items: ModelTurnItem[],
): ModelTurnItem[] {
  return items.filter(
    item => item.kind !== 'raw_model_output' && item.kind !== 'ui_message',
  )
}

function shouldRenderInfoUiMessage(item: ModelUiMessageItem): boolean {
  if (item.source === 'commentary') {
    return item.text.trim().length > 0
  }
  return false
}

export function createSystemMessageFromModelTurnItem(
  item: ModelTurnItem,
): SystemMessage | null {
  let level: SystemMessage['level'] = 'info'
  let content: string | null = null

  switch (item.kind) {
    case 'local_shell_call':
      // Bash tool_use blocks already render the requested command.
      return null
    case 'permission_request':
      return null
    case 'permission_decision':
      level = item.decision === 'deny' ? 'warn' : 'info'
      content = item.decision === 'deny' ? `Permission denied: ${item.toolName}` : null
      break
    case 'execution_result':
      level = item.status === 'success' ? 'success' : 'warn'
      content =
        item.status === 'success'
          ? null
          : `${item.toolName} ${item.status === 'denied' ? 'denied' : 'failed'}`
      break
    case 'tool_output':
      return null
    case 'ui_message':
      if (item.level === 'info') {
        if (!shouldRenderInfoUiMessage(item)) {
          return null
        }
        content = item.text
        break
      }
      if (item.level !== 'info') {
        level = item.level
        content = item.text
        break
      }
      return null
    default:
      return null
  }

  if (!content) {
    return null
  }

  return {
    type: 'system',
    subtype: 'informational',
    level,
    content,
    modelTurnItem: item,
  } as SystemMessage
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
    | 'ui_message'
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
      item.kind !== 'execution_result' &&
      item.kind !== 'ui_message'
    ) {
      continue
    }

    if (
      item.kind === 'ui_message' &&
      item.level === 'info' &&
      !shouldRenderInfoUiMessage(item)
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

export type PreferredAssistantTurnContent = {
  kind: 'empty' | 'text' | 'tool_use_message'
  renderableItems: ModelTurnItem[]
  text?: string
  contentBlocks?: ContentBlock[]
}

export type SyntheticAssistantPayload = {
  content: ContentBlock[]
  modelTurnItems: ModelTurnItem[]
}

export type PreferredAssistantResponsePayload =
  | {
      kind: 'empty'
    }
  | {
      kind: 'api_error'
      errorMessage: string
    }
  | {
      kind: 'synthetic_payload'
      payload: SyntheticAssistantPayload
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

export function extractFinalAnswerTextFromTurnItems(
  items: readonly ModelTurnItem[],
  separator = '\n',
): string {
  const finalAnswers = items.filter(
    (item): item is ModelFinalAnswerItem => item.kind === 'final_answer',
  )

  if (separator === '') {
    return finalAnswers
      .map(item => item.text)
      .filter(text => text.trim().length > 0)
      .join('')
      .trim()
  }

  return finalAnswers
    .map(item => item.text.trim())
    .filter(text => text.length > 0)
    .join(separator)
}

export function resolvePreferredAssistantTurnContent(
  items: ModelTurnItem[],
): PreferredAssistantTurnContent {
  const renderableItems = getRenderableModelTurnItems(items)
  if (renderableItems.length === 0) {
    return {
      kind: 'empty',
      renderableItems,
    }
  }

  const hasToolCall = renderableItems.some(item => item.kind === 'tool_call')
  const finalAnswerText = extractFinalAnswerTextFromTurnItems(renderableItems)

  if (!hasToolCall && finalAnswerText) {
    return {
      kind: 'text',
      renderableItems,
      text: finalAnswerText,
    }
  }

  const contentBlocks: ContentBlock[] = []
  for (const item of renderableItems) {
    if (item.kind === 'final_answer' && item.text) {
      contentBlocks.push({
        type: 'text',
        text: item.text,
      } as ContentBlock)
      continue
    }

    if (item.kind === 'tool_call') {
      contentBlocks.push({
        type: 'tool_use',
        id: item.toolUseId,
        name: item.toolName,
        input: item.input,
      } as ToolUseBlock)
    }
  }

  return {
    kind: contentBlocks.length > 0 ? 'tool_use_message' : 'empty',
    renderableItems,
    contentBlocks,
  }
}

export function isEmptyPreferredAssistantResponsePayload(
  payload: PreferredAssistantResponsePayload,
): boolean {
  return payload.kind === 'empty'
}

export function preferredAssistantResponsePayloadHasContent(
  payload: PreferredAssistantResponsePayload,
): boolean {
  return (
    payload.kind === 'synthetic_payload' && payload.payload.content.length > 0
  )
}

export function createPreferredAssistantResponsePayloadFromPreferredContent(
  preferred: PreferredAssistantTurnContent,
): PreferredAssistantResponsePayload {
  if (preferred.kind === 'empty') {
    return { kind: 'empty' }
  }

  return {
    kind: 'synthetic_payload',
    payload: createSyntheticAssistantPayloadFromPreferredContent(preferred),
  }
}

export function createSyntheticPayloadFromTurnItems(
  items: ModelTurnItem[],
): SyntheticAssistantPayload | null {
  const payload = createPreferredAssistantResponsePayloadFromTurnItems(items)
  if (payload.kind !== 'synthetic_payload') {
    return null
  }
  return payload.payload
}

export function createPreferredAssistantResponsePayloadFromTurnItems(
  items: ModelTurnItem[],
): PreferredAssistantResponsePayload {
  return createPreferredAssistantResponsePayloadFromPreferredContent(
    resolvePreferredAssistantTurnContent(items),
  )
}

export function createSyntheticAssistantPayloadFromPreferredContent(
  preferred: PreferredAssistantTurnContent,
): SyntheticAssistantPayload {
  return {
    content: normalizePreferredContentBlocks(preferred),
    modelTurnItems: preferred.renderableItems,
  }
}

function normalizePreferredContentBlocks(
  preferred: PreferredAssistantTurnContent,
): ContentBlock[] {
  if (preferred.kind === 'text') {
    return [
      {
        type: 'text',
        text: preferred.text === '' ? NO_CONTENT_MESSAGE : (preferred.text ?? NO_CONTENT_MESSAGE),
      } as ContentBlock,
    ]
  }

  return preferred.contentBlocks ?? []
}

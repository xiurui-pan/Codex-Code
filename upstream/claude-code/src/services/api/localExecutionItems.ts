import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import type {
  ModelExecutionResultItem,
  ModelPermissionDecisionItem,
  ModelPermissionRequestItem,
  ModelShellExecutionItem,
  ModelToolCallItem,
  ModelToolResultItem,
  ModelTurnItem,
} from './modelTurnItems.js'

function normalizeToolResultText(
  content: ToolResultBlockParam['content'],
): string {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map(item =>
      'text' in item && typeof item.text === 'string' ? item.text : '',
    )
    .filter(text => text.length > 0)
    .join('\n')
}

export function isLocalShellToolName(toolName: string): boolean {
  return toolName === BASH_TOOL_NAME
}

export function buildToolCallItemsForLocalExecution(
  toolUseId: string,
  toolName: string,
  input: Record<string, unknown>,
  source: 'structured' | 'text_fallback' | 'history',
): ModelTurnItem[] {
  const items: ModelTurnItem[] = [
    {
      kind: 'tool_call',
      provider: 'custom',
      toolUseId,
      toolName,
      input,
      source: source === 'history' ? 'structured' : source,
    } satisfies ModelToolCallItem,
  ]

  if (!isLocalShellToolName(toolName)) {
    return items
  }

  const command =
    typeof input.command === 'string' ? input.command.trim() : undefined
  if (!command) {
    return items
  }

  items.push({
    kind: 'local_shell_call',
    provider: 'custom',
    toolUseId,
    toolName,
    command,
    phase: 'requested',
    source: source === 'history' ? 'history' : 'provider',
  } satisfies ModelShellExecutionItem)

  return items
}

export function buildToolResultItemsForLocalExecution(
  toolUseId: string,
  toolName: string | undefined,
  block: ToolResultBlockParam,
  source: 'history' | 'tool_execution' = 'history',
): ModelTurnItem[] {
  const outputText = normalizeToolResultText(block.content)
  const items: ModelTurnItem[] = [
    {
      kind: 'tool_output',
      provider: 'custom',
      toolUseId,
      outputText,
      source,
    } satisfies ModelToolResultItem,
  ]

  if (!toolName || !isLocalShellToolName(toolName)) {
    return items
  }

  const denied =
    block.is_error === true &&
    /denied|rejected|aborted/i.test(outputText)
  const status: ModelExecutionResultItem['status'] = denied
    ? 'denied'
    : block.is_error
      ? 'error'
      : 'success'

  items.push({
    kind: 'local_shell_call',
    provider: 'custom',
    toolUseId,
    toolName,
    command: '',
    phase: 'completed',
    source,
  } satisfies ModelShellExecutionItem)
  items.push({
    kind: 'execution_result',
    provider: 'custom',
    toolUseId,
    toolName,
    status,
    outputText,
    source,
  } satisfies ModelExecutionResultItem)

  return items
}

export function buildPermissionItemsForLocalExecution(
  toolUseId: string,
  toolName: string,
  decision: 'allow' | 'deny' | 'ask',
  source: 'provider' | 'history' | 'tool_execution',
  includeRequest = true,
): ModelTurnItem[] {
  const items: ModelTurnItem[] = []
  if (includeRequest) {
    items.push({
      kind: 'permission_request',
      provider: 'custom',
      toolUseId,
      toolName,
      source,
    } satisfies ModelPermissionRequestItem)
  }
  items.push({
    kind: 'permission_decision',
    provider: 'custom',
    toolUseId,
    toolName,
    decision,
    source,
  } satisfies ModelPermissionDecisionItem)
  return items
}

export function getLocalExecutionOutputText(items: ModelTurnItem[]): string {
  const executionResult = items.find(
    item => item.kind === 'execution_result',
  ) as ModelExecutionResultItem | undefined
  if (executionResult) {
    return executionResult.outputText
  }

  const toolResult = items.find(
    item => item.kind === 'tool_output',
  ) as ModelToolResultItem | undefined
  return toolResult?.outputText ?? ''
}

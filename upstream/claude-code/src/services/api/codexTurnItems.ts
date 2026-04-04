import { randomUUID } from 'crypto'
import { dirname } from 'path'
import type { ModelTurnItem } from './modelTurnItems.js'
import { getOriginalCwd } from '../../bootstrap/state.js'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import { getFsImplementation } from '../../utils/fsOperations.js'
import { buildToolCallItemsForLocalExecution } from './localExecutionItems.js'

type ResponsesOutputText = {
  type: 'output_text'
  text?: string
}

type ResponsesMessageItem = {
  type: 'message'
  role?: string
  phase?: 'commentary' | 'final_answer'
  content?: ResponsesOutputText[]
}

type ResponsesFunctionCallItem = {
  type: 'function_call'
  call_id?: string
  name?: string
  arguments?: string | Record<string, unknown>
}

type ResponsesWebSearchAction =
  | {
      type?: 'search'
      query?: string
      queries?: string[]
    }
  | {
      type?: 'open_page'
      url?: string
    }
  | {
      type?: 'find_in_page'
      url?: string
      pattern?: string
    }

type ResponsesWebSearchCallItem = {
  type: 'web_search_call'
  id?: string
  status?: string
  action?: ResponsesWebSearchAction
}

export type ResponsesOutputItem =
  | ResponsesMessageItem
  | ResponsesFunctionCallItem
  | ResponsesWebSearchCallItem

type NormalizeResponsesOutputOptions = {
  allowTextFallbackToolCall?: boolean
}

type ParsedToolCall = {
  toolName: string
  input: Record<string, unknown>
}

const TOOL_PROTOCOL_LEAK_MARKERS = [
  'to=shell',
  'recipient_name',
  'functions.Bash',
  'with_escalated_permissions',
  'justification',
  'sandbox_permissions',
  'to=functions.',
]

const CODEX_VIRTUAL_WORKSPACE_ROOT = '/workspace'
const PATH_LIKE_ARGUMENT_KEYS = new Set([
  'file_path',
  'path',
  'cwd',
  'directory',
  'notebook_path',
])
const COMMAND_LIKE_ARGUMENT_KEYS = new Set(['command', 'cmd'])

function shouldRewriteCodexWorkspacePaths(): boolean {
  return (
    process.env.CLAUDE_CODE_USE_CODEX_PROVIDER === '1' &&
    getOriginalCwd() !== CODEX_VIRTUAL_WORKSPACE_ROOT
  )
}

function rewriteCodexWorkspacePath(pathValue: string): string {
  if (!shouldRewriteCodexWorkspacePaths()) {
    return pathValue
  }

  if (
    pathValue !== CODEX_VIRTUAL_WORKSPACE_ROOT &&
    !pathValue.startsWith(`${CODEX_VIRTUAL_WORKSPACE_ROOT}/`)
  ) {
    return pathValue
  }

  const originalCwd = getOriginalCwd()
  const suffix = pathValue.slice(CODEX_VIRTUAL_WORKSPACE_ROOT.length)
  const mappedPath = `${originalCwd}${suffix}`
  const fs = getFsImplementation()

  try {
    if (fs.existsSync(pathValue) && !fs.existsSync(mappedPath)) {
      return pathValue
    }

    if (fs.existsSync(mappedPath) || fs.existsSync(dirname(mappedPath))) {
      return mappedPath
    }
  } catch {
    // Fall through to the mapped path when filesystem probing fails.
  }

  return mappedPath
}

function rewriteCodexWorkspacePathsInCommand(command: string): string {
  if (!shouldRewriteCodexWorkspacePaths()) {
    return command
  }

  const originalCwd = getOriginalCwd()
  return command.replace(
    /(^|[\s"'`(=,:])\/workspace(?=\/|$)/g,
    (_match, prefix: string) => `${prefix}${originalCwd}`,
  )
}

function normalizeCodexToolArgumentValue(
  value: unknown,
  parentKey?: string,
): unknown {
  if (typeof value === 'string') {
    if (parentKey && PATH_LIKE_ARGUMENT_KEYS.has(parentKey)) {
      return rewriteCodexWorkspacePath(value)
    }

    if (parentKey && COMMAND_LIKE_ARGUMENT_KEYS.has(parentKey)) {
      return rewriteCodexWorkspacePathsInCommand(value)
    }

    return value
  }

  if (Array.isArray(value)) {
    return value.map(entry =>
      normalizeCodexToolArgumentValue(entry, parentKey),
    )
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      normalizeCodexToolArgumentValue(entry, key),
    ]),
  )
}

function normalizeToolArguments(
  argumentsValue: string | Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!argumentsValue) {
    return {}
  }

  if (typeof argumentsValue !== 'string') {
    return argumentsValue
  }

  try {
    const parsed = JSON.parse(argumentsValue) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return normalizeCodexToolArgumentValue(
        parsed,
      ) as Record<string, unknown>
    }
  } catch {
    return {}
  }

  return {}
}

function extractBalancedJsonObject(
  text: string,
  startIndex = 0,
): string | null {
  const start = text.indexOf('{', startIndex)
  if (start === -1) {
    return null
  }

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < text.length; index += 1) {
    const char = text[index]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      depth += 1
      continue
    }

    if (char !== '}') {
      continue
    }

    depth -= 1
    if (depth === 0) {
      return text.slice(start, index + 1)
    }
  }

  return null
}

function extractJsonObjectAfterMarker(
  text: string,
  marker: string,
): string | null {
  const markerIndex = text.indexOf(marker)
  if (markerIndex === -1) {
    return null
  }

  return extractBalancedJsonObject(text, markerIndex + marker.length)
}

function normalizeShellCommandFromPayload(
  payload: Record<string, unknown>,
): ParsedToolCall | null {
  const commandValue = payload.command ?? payload.cmd
  let command: string | null = null

  if (typeof commandValue === 'string' && commandValue.trim()) {
    command = commandValue.trim()
  } else if (Array.isArray(commandValue)) {
    const commandParts = commandValue.filter(
      part => typeof part === 'string',
    ) as string[]

    if (
      commandParts.length >= 3 &&
      (commandParts[0] === 'bash' || commandParts[0] === 'sh') &&
      commandParts[1] === '-lc'
    ) {
      command = commandParts.slice(2).join(' ').trim()
    } else if (commandParts.length > 0) {
      command = commandParts.join(' ').trim()
    }
  }

  if (!command) {
    return null
  }

  const input: Record<string, unknown> = { command }
  const timeoutValue = payload.timeout_ms ?? payload.timeout
  if (typeof timeoutValue === 'number' && Number.isFinite(timeoutValue)) {
    input.timeout = timeoutValue
  }

  return {
    toolName: BASH_TOOL_NAME,
    input,
  }
}

function extractShellCommandFromQuotedCode(text: string): ParsedToolCall | null {
  const match = text.match(/^(['"])([\s\S]*?)\1$/)
  const command = match?.[2]?.trim()
  if (!command) {
    return null
  }

  return {
    toolName: BASH_TOOL_NAME,
    input: { command },
  }
}

function extractTextFallbackToolCall(text: string): ParsedToolCall | null {
  const trimmedText = text.trim()
  if (!trimmedText.startsWith('to=shell') && !trimmedText.startsWith('code:')) {
    return null
  }

  const payloadText = trimmedText.startsWith('to=shell')
    ? trimmedText.slice('to=shell'.length).trimStart()
    : trimmedText.slice('code:'.length).trimStart()

  if (!payloadText) {
    return null
  }

  const normalizedPayloadText = payloadText.startsWith('code:')
    ? payloadText.slice('code:'.length).trimStart()
    : payloadText

  const jsonPayload = extractBalancedJsonObject(normalizedPayloadText, 0)
  if (
    jsonPayload &&
    jsonPayload.length === normalizedPayloadText.length
  ) {
    let payload: unknown
    try {
      payload = JSON.parse(jsonPayload) as unknown
    } catch {
      payload = null
    }

    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return normalizeShellCommandFromPayload(
        payload as Record<string, unknown>,
      )
    }
  }

  return extractShellCommandFromQuotedCode(normalizedPayloadText)
}

function isProtocolLeakText(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) {
    return false
  }

  if (TOOL_PROTOCOL_LEAK_MARKERS.some(marker => normalized.includes(marker))) {
    return true
  }

  if (
    normalized.startsWith('{') &&
    normalized.includes('"parameters"') &&
    normalized.includes('"command"')
  ) {
    return true
  }

  return false
}

function getWebSearchQuery(
  action: ResponsesWebSearchAction | undefined,
): string | null {
  if (!action) {
    return null
  }

  if (action.type === 'search') {
    if (typeof action.query === 'string' && action.query.trim()) {
      return action.query.trim()
    }

    if (Array.isArray(action.queries)) {
      const queries = action.queries.filter(
        query => typeof query === 'string' && query.trim().length > 0,
      ) as string[]
      if (queries.length > 0) {
        return queries.join(' | ')
      }
    }

    return null
  }

  if (action.type === 'open_page') {
    return typeof action.url === 'string' && action.url.trim().length > 0
      ? action.url.trim()
      : null
  }

  if (action.type === 'find_in_page') {
    if (typeof action.pattern === 'string' && action.pattern.trim().length > 0) {
      return action.pattern.trim()
    }
    return typeof action.url === 'string' && action.url.trim().length > 0
      ? action.url.trim()
      : null
  }

  return null
}

function buildWebSearchUiMessage(
  item: ResponsesWebSearchCallItem,
): string {
  const query = getWebSearchQuery(item.action)
  if (item.status === 'completed') {
    return query ? `联网搜索已完成: ${query}` : '联网搜索已完成'
  }

  return query ? `正在联网搜索: ${query}` : '正在联网搜索...'
}

export function normalizeResponsesOutputToTurnItems(
  items: ResponsesOutputItem[],
  options: NormalizeResponsesOutputOptions = {},
): ModelTurnItem[] {
  const turnItems: ModelTurnItem[] = []

  for (const item of items) {
    turnItems.push({
      kind: 'raw_model_output',
      provider: 'custom',
      itemType: item.type,
      payload: item,
    })

    if (item.type === 'function_call' && item.call_id && item.name) {
      turnItems.push(
        ...buildToolCallItemsForLocalExecution(
          item.call_id,
          item.name,
          normalizeToolArguments(item.arguments),
          'structured',
        ),
      )
      continue
    }

    if (item.type === 'web_search_call') {
      const text = buildWebSearchUiMessage(item)
      turnItems.push({
        kind: 'ui_message',
        provider: 'custom',
        level: 'info',
        text,
        source:
          item.status === 'completed'
            ? 'web_search_call_completed'
            : 'web_search_call',
      })
      continue
    }

    if (item.type !== 'message' || item.role !== 'assistant') {
      continue
    }

    const text = (item.content ?? [])
      .filter(
        part => part.type === 'output_text' && typeof part.text === 'string',
      )
      .map(part => part.text ?? '')
      .join('')

    if (!text) {
      continue
    }

    const fallbackToolCall = extractTextFallbackToolCall(text)
    if (fallbackToolCall) {
      turnItems.push({
        kind: 'ui_message',
        provider: 'custom',
        level: 'warn',
        text: options.allowTextFallbackToolCall
          ? 'Provider emitted a text fallback tool call; using isolated debug parser.'
          : 'Provider emitted a text fallback tool call; filtered out of the execution path.',
        source: options.allowTextFallbackToolCall
          ? 'text_fallback_tool_call'
          : 'text_fallback_filtered',
      })
      if (options.allowTextFallbackToolCall) {
        turnItems.push(
          ...buildToolCallItemsForLocalExecution(
            randomUUID(),
            fallbackToolCall.toolName,
            fallbackToolCall.input,
            'text_fallback',
          ),
        )
      }
      continue
    }

    if (isProtocolLeakText(text)) {
      turnItems.push({
        kind: 'ui_message',
        provider: 'custom',
        level: 'warn',
        text,
        source: 'protocol_leak_filtered',
      })
      continue
    }

    if (item.phase === 'commentary') {
      continue
    }

    turnItems.push({
      kind: 'final_answer',
      provider: 'custom',
      text,
      source: 'message_output_filtered',
    })
  }

  return turnItems
}

import { randomUUID } from 'crypto'
import { dirname } from 'path'
import type { ModelTurnItem } from './modelTurnItems.js'
import { getOriginalCwd } from '../../bootstrap/state.js'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import { tryQuoteShellArgs } from '../../utils/bash/shellQuote.js'
import { getFsImplementation } from '../../utils/fsOperations.js'
import { buildToolCallItemsForLocalExecution } from './localExecutionItems.js'

type ResponsesMessageText = {
  type: 'input_text' | 'output_text'
  text?: string
}

type ResponsesEncryptedContentItem = {
  type: string
  encrypted_content?: string
}

type ResponsesMessageItem = {
  type: 'message'
  id?: string
  role?: string
  phase?: 'commentary' | 'final_answer'
  content?: ResponsesMessageText[]
}

type ResponsesFunctionCallItem = {
  type: 'function_call'
  id?: string
  call_id?: string
  status?: string
  name?: string
  arguments?: string | Record<string, unknown>
}

type ResponsesFunctionCallOutputItem = {
  type: 'function_call_output'
  call_id?: string
  output?: string
}

type ResponsesShellAction = {
  commands?: string[]
  timeout_ms?: number
  max_output_length?: number
  working_directory?: string
}

type ResponsesShellCallItem = {
  type: 'shell_call'
  id?: string
  call_id?: string
  status?: string
  action?: ResponsesShellAction
}

type ResponsesShellCallOutputResult = {
  stdout?: string
  stderr?: string
  outcome?: {
    type?: 'exit' | 'timeout'
    exit_code?: number
  }
}

type ResponsesShellCallOutputItem = {
  type: 'shell_call_output'
  call_id?: string
  max_output_length?: number
  output?: ResponsesShellCallOutputResult[]
}

type ResponsesLocalShellExecAction = {
  type?: 'exec'
  command?: string[] | string
  timeout_ms?: number
  working_directory?: string
}

type ResponsesLocalShellCallItem = {
  type: 'local_shell_call'
  id?: string
  call_id?: string
  status?: string
  action?: ResponsesLocalShellExecAction
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

type ResponsesReasoningItem = ResponsesEncryptedContentItem & {
  type: 'reasoning'
}

type ResponsesCompactionItem = ResponsesEncryptedContentItem & {
  type: 'compaction' | 'compaction_summary'
}

export type ResponsesOutputItem =
  | ResponsesMessageItem
  | ResponsesFunctionCallItem
  | ResponsesFunctionCallOutputItem
  | ResponsesShellCallItem
  | ResponsesShellCallOutputItem
  | ResponsesLocalShellCallItem
  | ResponsesWebSearchCallItem
  | ResponsesReasoningItem
  | ResponsesCompactionItem

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
  '"type":"shell_call"',
  '"type": "shell_call"',
  '"type":"local_shell_call"',
  '"type": "local_shell_call"',
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
  'workdir',
  'directory',
  'working_directory',
  'notebook_path',
])
const COMMAND_LIKE_ARGUMENT_KEYS = new Set(['command', 'cmd'])
const CODEX_SHELL_TOOL_NAME = 'local_shell'
const LEGACY_CODEX_SHELL_TOOL_NAME = 'shell'

function shouldRewriteCodexWorkspacePaths(): boolean {
  return (
    process.env.CODEX_CODE_USE_CODEX_PROVIDER === '1' &&
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
  const workdirValue =
    typeof payload.workdir === 'string'
      ? payload.workdir
      : typeof payload.working_directory === 'string'
        ? payload.working_directory
        : typeof payload.cwd === 'string'
          ? payload.cwd
          : typeof payload.directory === 'string'
            ? payload.directory
            : null
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
      const quoted = tryQuoteShellArgs(commandParts)
      command = (quoted.success ? quoted.quoted : commandParts.join(' ')).trim()
    }
  }

  if (!command) {
    return null
  }

  const workdir = workdirValue?.trim()
  if (workdir) {
    const quotedWorkdir = tryQuoteShellArgs([workdir])
    const normalizedWorkdir = quotedWorkdir.success
      ? quotedWorkdir.quoted
      : workdir
    command = `cd ${normalizedWorkdir} && ${command}`
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

function normalizeLocalShellAction(
  action: ResponsesLocalShellExecAction | undefined,
): ParsedToolCall | null {
  if (!action || action.type !== 'exec') {
    return null
  }

  const command = Array.isArray(action.command)
    ? action.command.filter(part => typeof part === 'string')
    : action.command

  if (
    Array.isArray(command) &&
    command.length > 0 &&
    command.every(part => typeof part === 'string')
  ) {
    return normalizeShellCommandFromPayload({
      command,
      timeout_ms: action.timeout_ms,
      cwd: action.working_directory,
    })
  }

  if (typeof command === 'string' && command.trim().length > 0) {
    return normalizeShellCommandFromPayload({
      command,
      timeout_ms: action.timeout_ms,
      cwd: action.working_directory,
    })
  }

  return null
}

function normalizeShellAction(
  action: ResponsesShellAction | undefined,
): ParsedToolCall | null {
  if (!action || !Array.isArray(action.commands) || action.commands.length === 0) {
    return null
  }

  const commands = action.commands.filter(
    command => typeof command === 'string' && command.trim().length > 0,
  )
  if (commands.length === 0) {
    return null
  }

  return normalizeShellCommandFromPayload({
    command: commands.join(' && '),
    timeout_ms: action.timeout_ms,
    cwd: action.working_directory,
  })
}

function stringifyLocalShellCommand(
  command: string[] | string | undefined,
): string {
  if (typeof command === 'string') {
    return command.trim()
  }

  if (!Array.isArray(command) || command.length === 0) {
    return ''
  }

  const parts = command.filter(part => typeof part === 'string')
  if (parts.length === 0) {
    return ''
  }

  const quoted = tryQuoteShellArgs(parts)
  return quoted.success ? quoted.quoted : parts.join(' ')
}

function stringifyShellCommands(commands: string[] | undefined): string {
  if (!Array.isArray(commands) || commands.length === 0) {
    return ''
  }

  return commands
    .filter(command => typeof command === 'string' && command.trim().length > 0)
    .join(' && ')
}

function normalizeShellCallOutput(
  item: ResponsesShellCallOutputItem,
): {
  outputText: string
  status: 'success' | 'error'
} | null {
  if (!item.call_id || !Array.isArray(item.output) || item.output.length === 0) {
    return null
  }

  const outputText = item.output
    .map(result => {
      const parts = [result.stdout, result.stderr].filter(
        text => typeof text === 'string' && text.length > 0,
      )
      return parts.join('\n')
    })
    .filter(text => text.length > 0)
    .join('\n')

  const status = item.output.every(result => {
    const outcome = result.outcome
    return outcome?.type === 'exit' ? outcome.exit_code === 0 : false
  })
    ? 'success'
    : 'error'

  return {
    outputText,
    status,
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
  if (trimmedText.startsWith('{')) {
    try {
      const payload = JSON.parse(trimmedText) as unknown
      if (
        payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload)
      ) {
        const payloadType = (payload as { type?: unknown }).type
        if (payloadType === 'shell_call') {
          return normalizeShellAction(
            (payload as { action?: ResponsesShellAction }).action,
          )
        }
        if (payloadType === 'local_shell_call') {
          return normalizeLocalShellAction(
            (payload as { action?: ResponsesLocalShellExecAction }).action,
          )
        }
      }
    } catch {
      return null
    }
  }

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
    ((normalized.includes('"parameters"') &&
      normalized.includes('"command"')) ||
      normalized.includes('"type":"shell_call"') ||
      normalized.includes('"type": "shell_call"') ||
      normalized.includes('"type":"local_shell_call"') ||
      normalized.includes('"type": "local_shell_call"'))
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
    return query ? `Web search completed: ${query}` : 'Web search completed'
  }

  return query ? `Searching: ${query}` : 'Searching...'
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

    if (item.type === 'shell_call') {
      const toolUseId = item.call_id ?? item.id
      if (!toolUseId) {
        turnItems.push({
          kind: 'ui_message',
          provider: 'custom',
          level: 'warn',
          text: 'Invalid shell_call received: missing call_id',
          source: 'invalid_local_shell_call_filtered',
        })
        continue
      }

      const parsedToolCall = normalizeShellAction(item.action)
      if (!parsedToolCall) {
        const commandText = stringifyShellCommands(item.action?.commands)
        turnItems.push({
          kind: 'ui_message',
          provider: 'custom',
          level: 'warn',
          text:
            commandText.length > 0
              ? `Invalid shell_call received: unsupported action for ${commandText}`
              : 'Invalid shell_call received: unsupported action',
          source: 'invalid_local_shell_call_filtered',
        })
        continue
      }

      turnItems.push(
        ...buildToolCallItemsForLocalExecution(
          toolUseId,
          parsedToolCall.toolName,
          parsedToolCall.input,
          'structured',
        ),
      )
      continue
    }

    if (item.type === 'local_shell_call') {
      const toolUseId = item.call_id ?? item.id
      if (!toolUseId) {
        turnItems.push({
          kind: 'ui_message',
          provider: 'custom',
          level: 'warn',
          text: 'Invalid local_shell_call received: missing call_id',
          source: 'invalid_local_shell_call_filtered',
        })
        continue
      }

      const parsedToolCall = normalizeLocalShellAction(item.action)
      if (!parsedToolCall) {
        const commandText = stringifyLocalShellCommand(item.action?.command)
        turnItems.push({
          kind: 'ui_message',
          provider: 'custom',
          level: 'warn',
          text:
            commandText.length > 0
              ? `Invalid local_shell_call received: unsupported action for ${commandText}`
              : 'Invalid local_shell_call received: unsupported action',
          source: 'invalid_local_shell_call_filtered',
        })
        continue
      }

      turnItems.push(
        ...buildToolCallItemsForLocalExecution(
          toolUseId,
          parsedToolCall.toolName,
          parsedToolCall.input,
          'structured',
        ),
      )
      continue
    }

    if (item.type === 'shell_call_output') {
      const normalizedOutput = normalizeShellCallOutput(item)
      if (!item.call_id || !normalizedOutput) {
        turnItems.push({
          kind: 'ui_message',
          provider: 'custom',
          level: 'warn',
          text: 'Invalid shell_call_output received: missing call_id or output',
          source: 'invalid_local_shell_call_filtered',
        })
        continue
      }

      turnItems.push({
        kind: 'tool_output',
        provider: 'custom',
        toolUseId: item.call_id,
        outputText: normalizedOutput.outputText,
        source: 'tool_execution',
      })
      turnItems.push({
        kind: 'local_shell_call',
        provider: 'custom',
        toolUseId: item.call_id,
        toolName: BASH_TOOL_NAME,
        command: '',
        phase: 'completed',
        source: 'tool_execution',
      })
      turnItems.push({
        kind: 'execution_result',
        provider: 'custom',
        toolUseId: item.call_id,
        toolName: BASH_TOOL_NAME,
        status: normalizedOutput.status,
        outputText: normalizedOutput.outputText,
        source: 'tool_execution',
      })
      continue
    }

    if (item.type === 'function_call') {
      // Validate function_call has required fields
      if (!item.call_id || !item.name || item.name.trim() === '') {
        // Log warning for invalid function_call and skip processing
        turnItems.push({
          kind: 'ui_message',
          provider: 'custom',
          level: 'warn',
          text: `Invalid function_call received: missing ${!item.call_id ? 'call_id' : 'name'}`,
          source: 'invalid_function_call_filtered',
        })
        continue
      }

      if (
        item.name === CODEX_SHELL_TOOL_NAME ||
        item.name === LEGACY_CODEX_SHELL_TOOL_NAME
      ) {
        const parsedToolCall = normalizeShellCommandFromPayload(
          normalizeToolArguments(item.arguments),
        )
        if (!parsedToolCall) {
          turnItems.push({
            kind: 'ui_message',
            provider: 'custom',
            level: 'warn',
            text: 'Invalid function_call received: unsupported shell arguments',
            source: 'invalid_function_call_filtered',
          })
          continue
        }

        turnItems.push(
          ...buildToolCallItemsForLocalExecution(
            item.call_id,
            parsedToolCall.toolName,
            parsedToolCall.input,
            'structured',
          ),
        )
        continue
      }

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

    // Handle function_call_output (agent/subagent results) so the
    // main model can see them in subsequent turns instead of re-searching.
    if (item.type === 'function_call_output' && item.call_id) {
      turnItems.push({
        kind: 'tool_output',
        provider: 'custom',
        toolUseId: item.call_id,
        outputText: typeof item.output === 'string' ? item.output : '',
        source: 'tool_execution',
      })
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

    if (item.type === 'reasoning') {
      turnItems.push({
        kind: 'opaque_reasoning',
        provider: 'custom',
        itemType: item.type,
        payload: item,
      })
      continue
    }

    if (
      item.type === 'compaction' ||
      item.type === 'compaction_summary'
    ) {
      turnItems.push({
        kind: 'opaque_compaction',
        provider: 'custom',
        itemType: item.type,
        payload: item,
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
      turnItems.push({
        kind: 'ui_message',
        provider: 'custom',
        level: 'info',
        text,
        source: 'commentary',
      })
      continue
    }

    turnItems.push({
      kind: 'final_answer',
      provider: 'custom',
      text,
      source: 'message_output',
    })
  }

  return turnItems
}

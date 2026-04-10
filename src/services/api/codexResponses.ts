import type {
  ContentBlock,
  ContentBlockParam,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import {
  type Tool,
  type Tools,
} from '../../Tool.js'
import type { AgentDefinition } from '../../tools/AgentTool/loadAgentsDir.js'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import type { Message } from '../../types/message.js'
import type { PermissionMode } from '../../utils/permissions/PermissionMode.js'
import {
  getCodexConfiguredApiKey,
  getCodexConfiguredWebSearchAllowedDomains,
  getCodexConfiguredBaseUrl,
  getCodexRequestMaxRetries,
  getCodexStreamIdleTimeoutMs,
  getCodexStreamMaxRetries,
  getCodexConfiguredWebSearchContextSize,
  getCodexConfiguredWebSearchLocation,
  getCodexConfiguredModel,
  getCodexConfiguredReasoningSummary,
  getCodexConfiguredWebSearchMode,
  getCodexConfiguredResponseStorage,
} from '../../utils/codexConfig.js'
import { errorMessage } from '../../utils/errors.js'
import { resolveAppliedEffort } from '../../utils/effort.js'
import { sleep } from '../../utils/sleep.js'
import { getCwd } from '../../utils/cwd.js'
import {
  ensureToolResultPairing,
  normalizeMessagesForAPI,
} from '../../utils/messages.js'
import {
  DEFAULT_CODEX_MODEL,
  codexModelSupportsParallelToolCalls,
  findCodexModelCapability,
  getCodexDefaultReasoningSummaryForModel,
  getCodexDefaultVerbosityForModel,
  getCodexSupportedEffortLevels,
} from '../../utils/model/codexModels.js'
import type { SystemPrompt } from '../../utils/systemPromptType.js'
import { zodToJsonSchema } from '../../utils/zodToJsonSchema.js'
import {
  type ModelTurnItem,
} from './modelTurnItems.js'
import {
  buildToolCallItemsForLocalExecution,
  buildToolResultItemsForLocalExecution,
  getLocalExecutionOutputText,
  isLocalShellToolName,
} from './localExecutionItems.js'
import {
  normalizeResponsesOutputToTurnItems,
  type ResponsesOutputItem,
} from './codexTurnItems.js'
import { buildCodexRequestIdentity } from './codexRequestIdentity.js'
import { getSessionId } from '../../bootstrap/state.js'
import { getCodexProviderProfile } from './providerProfiles.js'
import { API_ERROR_MESSAGE_PREFIX } from './errors.js'
import { NO_CONTENT_MESSAGE } from '../../constants/messages.js'

type CodexResponsesEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
type CodexResponsesReasoningSummary = 'auto'
type CodexResponsesVerbosity = 'low' | 'medium' | 'high'

type AssistantMessageSeed = {
  id?: string
  text: string
}

type CodexRequestOptions = {
  model?: string
  effortValue?: string | number | null
  resolvedEffortValue?: string | number | null
  permissionMode?: PermissionMode
  getToolPermissionContext?: () => Promise<unknown>
  tools?: Tools
  fastMode?: boolean
  extraToolSchemas?: Array<Record<string, unknown>>
  agents?: AgentDefinition[]
  allowedAgentTypes?: string[]
}

type CodexStreamingArgs = {
  messages: Message[]
  systemPrompt: SystemPrompt
  tools?: Tools
  options: CodexRequestOptions
  signal: AbortSignal
}

export type CodexTurnItemChunk = {
  kind: 'turn_items'
  turnItems: ModelTurnItem[]
}

export type CodexApiErrorChunk = {
  kind: 'api_error'
  errorMessage: string
}

export type CodexStreamEventChunk = {
  kind: 'stream_event'
  event: {
    type: 'content_block_start' | 'content_block_delta' | 'content_block_stop'
    [key: string]: unknown
  }
}

export type CodexUsageChunk = {
  kind: 'usage'
  usage: ResponsesCompletedUsage
}

export type CodexRetryChunk = {
  kind: 'retry'
  message: string
  attempt: number
  maxRetries: number
  delayMs: number
}

export type CodexResponseChunk =
  | CodexTurnItemChunk
  | CodexApiErrorChunk
  | CodexStreamEventChunk
  | CodexUsageChunk
  | CodexRetryChunk

export type CodexResponseResult = {
  turnItems: ModelTurnItem[]
  errorMessage?: string
}

export type CodexCompactResponseResult = {
  outputItems: ResponsesOutputItem[]
  turnItems: ModelTurnItem[]
}

type ResponsesAssistantMessageItem = ResponsesOutputItem & {
  type: 'message'
  role: 'assistant'
  id: string
}

function isRetryUnsafeTurnItem(item: ModelTurnItem): boolean {
  return (
    item.kind !== 'raw_model_output' &&
    item.kind !== 'final_answer' &&
    item.kind !== 'ui_message'
  )
}

function extractAssistantMessageSeed(
  item: ResponsesOutputItem | undefined,
): AssistantMessageSeed | null {
  if (!item || item.type !== 'message' || item.role !== 'assistant') {
    return null
  }

  const text = (item.content ?? [])
    .filter(
      part => part.type === 'output_text' && typeof part.text === 'string',
    )
    .map(part => part.text ?? '')
    .join('')

  if (!text) {
    return null
  }

  return {
    id: item.id,
    text,
  }
}

function isResponsesAssistantMessageItem(
  item: ResponsesOutputItem | undefined,
): item is ResponsesAssistantMessageItem {
  return (
    !!item &&
    item.type === 'message' &&
    item.role === 'assistant' &&
    typeof item.id === 'string' &&
    item.id.length > 0
  )
}

function cloneAssistantMessageItem(
  item: ResponsesAssistantMessageItem,
): ResponsesAssistantMessageItem {
  return {
    ...item,
    content: (item.content ?? []).map(part => ({ ...part })),
  }
}

function setAssistantMessageItemText(
  item: ResponsesAssistantMessageItem,
  text: string,
): ResponsesAssistantMessageItem {
  return {
    ...item,
    content: [
      {
        type: 'output_text',
        text,
      },
    ],
  }
}

function createPendingAssistantMessageItem(
  itemId: string,
): ResponsesAssistantMessageItem {
  return {
    type: 'message',
    id: itemId,
    role: 'assistant',
    phase: 'commentary',
    content: [],
  }
}

type ResponsesOutputText = {
  type: 'output_text'
  text?: string
}

type ResponsesInputText = {
  type: 'input_text'
  text: string
}

type ResponsesMessageRole = 'developer' | 'user' | 'assistant'

type ResponsesCompletedUsage = {
  input_tokens: number
  input_tokens_details?: {
    cached_tokens?: number
  }
  output_tokens: number
  output_tokens_details?: {
    reasoning_tokens?: number
  }
  total_tokens: number
}

type ResponsesCompletedEvent = {
  type: 'response.completed'
  response?: {
    id?: string
    usage?: ResponsesCompletedUsage
  }
}

type ResponsesOutputDoneEvent = {
  type: 'response.output_item.done'
  item?: ResponsesOutputItem
}

type ResponsesContentPartAddedEvent = {
  type: 'response.content_part.added'
  content_index?: number
  item_id?: string
  output_index?: number
  part?: {
    type?: string
    text?: string
  }
}

type ResponsesOutputTextDeltaEvent = {
  type: 'response.output_text.delta'
  content_index?: number
  delta?: string
  item_id?: string
  output_index?: number
}

type ResponsesFunctionCallArgumentsDeltaEvent = {
  type: 'response.function_call_arguments.delta'
  delta?: string
  item_id?: string
  output_index?: number
}

type ResponsesFunctionCallArgumentsDoneEvent = {
  type: 'response.function_call_arguments.done'
  arguments?: string
  item_id?: string
  output_index?: number
}

type ResponsesOutputAddedEvent = {
  type: 'response.output_item.added'
  item?: ResponsesOutputItem
}

type ResponsesFailureEvent = {
  type: 'response.failed' | 'error'
  error?: {
    code?: string
    message?: string
  }
  response?: {
    error?: {
      code?: string
      message?: string
    }
  }
  detail?: string
  message?: string
}

type ResponsesIncompleteEvent = {
  type: 'response.incomplete'
  response?: {
    incomplete_details?: {
      reason?: string
    }
  }
}

type ResponsesReasoningSummaryPartAddedEvent = {
  type: 'response.reasoning_summary_part.added'
  summary_index?: number
  item_id?: string
  output_index?: number
}

type ResponsesReasoningSummaryPartDoneEvent = {
  type: 'response.reasoning_summary_part.done'
  summary_index?: number
  item_id?: string
  output_index?: number
}

type ResponsesReasoningSummaryTextDeltaEvent = {
  type: 'response.reasoning_summary_text.delta'
  delta?: string
  summary_index?: number
  item_id?: string
  output_index?: number
}

type ResponsesStreamEvent =
  | ResponsesCompletedEvent
  | ResponsesOutputDoneEvent
  | ResponsesContentPartAddedEvent
  | ResponsesFunctionCallArgumentsDeltaEvent
  | ResponsesFunctionCallArgumentsDoneEvent
  | ResponsesOutputTextDeltaEvent
  | ResponsesOutputAddedEvent
  | ResponsesFailureEvent
  | ResponsesIncompleteEvent
  | ResponsesReasoningSummaryPartAddedEvent
  | ResponsesReasoningSummaryPartDoneEvent
  | ResponsesReasoningSummaryTextDeltaEvent
  | { type?: string }

type ResponsesEncryptedInputItem = {
  type: 'reasoning' | 'compaction' | 'compaction_summary'
  encrypted_content: string
}

type ResponsesShellAction = {
  commands: string[]
  timeout_ms?: number
  max_output_length?: number
  working_directory?: string
}

type ResponsesShellCommandOutput = {
  stdout: string
  stderr: string
  outcome:
    | {
        type: 'exit'
        exit_code: number
      }
    | {
        type: 'timeout'
      }
}

type ResponsesInputItem =
  | {
      type: 'message'
      role: 'developer' | 'user'
      content: ResponsesInputText[]
    }
  | {
      type: 'message'
      role: 'assistant'
      content: ResponsesOutputText[]
    }
  | {
      type: 'function_call'
      call_id: string
      name: string
      arguments: string
    }
  | {
      type: 'function_call_output'
      call_id: string
      output: string
    }
  | {
      type: 'shell_call'
      call_id: string
      status: 'completed'
      action: ResponsesShellAction
    }
  | {
      type: 'shell_call_output'
      call_id: string
      max_output_length?: number
      output: ResponsesShellCommandOutput[]
    }
  | {
      type: 'local_shell_call'
      id?: string
      call_id: string
      status: 'completed'
      action: {
        type: 'exec'
        command: string[]
        timeout_ms?: number
        working_directory?: string
      }
    }
  | ResponsesEncryptedInputItem

type ResponsesFunctionTool = {
  type: 'function'
  name: string
  description: string
  strict: false
  parameters: Record<string, unknown>
}

type ResponsesNativeWebSearchTool = {
  type: 'web_search'
  external_web_access: boolean
  filters?: {
    allowed_domains?: string[]
  }
  user_location?: {
    type: 'approximate'
    country?: string
    region?: string
    city?: string
    timezone?: string
  }
  search_context_size?: string
}

type ResponsesRequestTool =
  | ResponsesFunctionTool
  | ResponsesNativeWebSearchTool

const CODEX_SHELL_TOOL_NAME = 'local_shell'
const LEGACY_CODEX_SHELL_TOOL_NAME = 'shell'
const CODEX_SHELL_TOOL_DESCRIPTION =
  'Runs a shell command and returns its output.\n' +
  '- The arguments to `local_shell` will be passed to execvp(). Most terminal commands should be prefixed with ["bash", "-lc"].\n' +
  '- Always set the `workdir` param when using the shell function. Do not use `cd` unless absolutely necessary.'
const CODEX_SHELL_TOOL_PARAMETERS: Record<string, unknown> = {
  type: 'object',
  properties: {
    command: {
      type: 'array',
      items: { type: 'string' },
      description: 'The command to execute',
    },
    workdir: {
      type: 'string',
      description: 'The working directory to execute the command in',
    },
    timeout_ms: {
      type: 'number',
      description: 'The timeout for the command in milliseconds',
    },
  },
  required: ['command'],
  additionalProperties: false,
}

function getResponsesBaseUrl(): string {
  const baseUrl = getCodexConfiguredBaseUrl()
  if (!baseUrl) {
    throw new Error(
      'Codex Responses adapter missing configured base URL (.codex model_providers.<id>.base_url / ANTHROPIC_BASE_URL)',
    )
  }
  return `${baseUrl.replace(/\/$/, '')}/responses`
}

function getResponsesCompactBaseUrl(): string {
  const baseUrl = getCodexConfiguredBaseUrl()
  if (!baseUrl) {
    throw new Error(
      'Codex Responses adapter missing configured base URL (.codex model_providers.<id>.base_url / ANTHROPIC_BASE_URL)',
    )
  }
  return `${baseUrl.replace(/\/$/, '')}/responses/compact`
}

function getResponsesApiKey(): string | null {
  return getCodexConfiguredApiKey() ?? null
}

function normalizeTextContent(
  content: string | ContentBlock[] | ContentBlockParam[],
): string {
  if (typeof content === 'string') {
    return content
  }

  return content
    .map(block => {
      if (block.type === 'text' && typeof block.text === 'string') {
        return block.text
      }
      return ''
    })
    .filter(text => text.length > 0)
    .join('\n')
}

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

function pushMessageInput(
  items: ResponsesInputItem[],
  role: ResponsesMessageRole,
  text: string,
): void {
  const normalizedText = text.trim()
  if (!normalizedText) {
    return
  }

  items.push({
    type: 'message',
    role,
    content: [
      role === 'assistant'
        ? {
            type: 'output_text',
            text: normalizedText,
          }
        : {
            type: 'input_text',
            text: normalizedText,
          },
    ],
  })
}

function pushUserMessageInputSections(
  items: ResponsesInputItem[],
  texts: readonly string[],
): void {
  const content = texts
    .map(text => text.trim())
    .filter(text => text.length > 0)
    .map(text => ({
      type: 'input_text' as const,
      text,
    }))

  if (content.length === 0) {
    return
  }

  items.push({
    type: 'message',
    role: 'user',
    content,
  })
}

const CONTEXTUAL_USER_TEXT_WRAPPERS = [
  ['<system-reminder>', '</system-reminder>'],
  ['<user_instructions>', '</user_instructions>'],
  ['<environment_context>', '</environment_context>'],
  ['<user_shell_command>', '</user_shell_command>'],
  ['<turn_aborted>', '</turn_aborted>'],
  ['<subagent_notification>', '</subagent_notification>'],
] as const

function isContextualUserText(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) {
    return false
  }

  return CONTEXTUAL_USER_TEXT_WRAPPERS.some(
    ([openTag, closeTag]) =>
      trimmed.startsWith(openTag) && trimmed.endsWith(closeTag),
  )
}

const PREPENDED_USER_CONTEXT_PREFIX =
  "<system-reminder>\nAs you answer the user's questions, you can use the following context:\n"
const PREPENDED_USER_CONTEXT_SUFFIX_PATTERN =
  /\n+\s*IMPORTANT: this context may or may not be relevant to your tasks\. You should not respond to this context unless it is highly relevant to your task\.\n<\/system-reminder>\s*$/s

function wrapCodexUserInstructions(text: string): string {
  return `# AGENTS.md instructions for ${getCwd()}\n\n<INSTRUCTIONS>\n${text}\n</INSTRUCTIONS>`
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function normalizeCurrentDateText(text: string): string {
  const trimmed = text.trim()
  const prefix = "Today's date is "
  if (trimmed.startsWith(prefix)) {
    return trimmed.slice(prefix.length).replace(/\.$/, '')
  }
  return trimmed
}

function buildEnvironmentContextText(currentDateText: string): string {
  const lines = [`  <cwd>${escapeXml(getCwd())}</cwd>`]
  const shellPath = process.env.SHELL?.trim()
  if (shellPath) {
    const shellName = shellPath.split('/').at(-1)
    if (shellName) {
      lines.push(`  <shell>${escapeXml(shellName)}</shell>`)
    }
  }
  const normalizedDateText = normalizeCurrentDateText(currentDateText)
  if (normalizedDateText) {
    lines.push(`  <current_date>${escapeXml(normalizedDateText)}</current_date>`)
  }
  return `<environment_context>\n${lines.join('\n')}\n</environment_context>`
}

function extractCodexContextualUserSections(
  text: string,
): string[] | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith(PREPENDED_USER_CONTEXT_PREFIX)) {
    return null
  }

  const suffixMatch = trimmed.match(PREPENDED_USER_CONTEXT_SUFFIX_PATTERN)
  if (!suffixMatch || suffixMatch.index === undefined) {
    return null
  }

  const inner = trimmed
    .slice(
      PREPENDED_USER_CONTEXT_PREFIX.length,
      suffixMatch.index,
    )
    .trim()

  if (!inner.startsWith('# claudeMd\n')) {
    return null
  }

  const currentDateMarker = '\n# currentDate\n'
  const currentDateIndex = inner.lastIndexOf(currentDateMarker)
  const claudeMdBody =
    currentDateIndex >= 0
      ? inner.slice('# claudeMd\n'.length, currentDateIndex).trim()
      : inner.slice('# claudeMd\n'.length).trim()
  const currentDateBody =
    currentDateIndex >= 0
      ? inner.slice(currentDateIndex + currentDateMarker.length).trim()
      : ''

  const sections: string[] = []
  if (claudeMdBody) {
    sections.push(wrapCodexUserInstructions(claudeMdBody))
  }
  if (currentDateBody) {
    sections.push(buildEnvironmentContextText(currentDateBody))
  }

  return sections.length > 0 ? sections : null
}

function formatCodexProviderApiError(message: string): string {
  const trimmedMessage = message.trim()
  if (!trimmedMessage) {
    return API_ERROR_MESSAGE_PREFIX
  }
  if (trimmedMessage.startsWith(API_ERROR_MESSAGE_PREFIX)) {
    return trimmedMessage
  }
  return `${API_ERROR_MESSAGE_PREFIX}: ${trimmedMessage}`
}

function getResponsesPayloadType(payload: unknown): string | null {
  return payload &&
    typeof payload === 'object' &&
    'type' in payload &&
    typeof (payload as { type?: unknown }).type === 'string'
    ? (payload as { type: string }).type
    : null
}

function isResponsesCompactionType(type: string | null): boolean {
  return type === 'compaction' || type === 'compaction_summary'
}

function mapInternalToolNameToResponsesToolName(toolName: string): string {
  return toolName === BASH_TOOL_NAME ? CODEX_SHELL_TOOL_NAME : toolName
}

function mapResponsesToolNameToInternalToolName(toolName: string): string {
  return toolName === CODEX_SHELL_TOOL_NAME ||
    toolName === LEGACY_CODEX_SHELL_TOOL_NAME
    ? BASH_TOOL_NAME
    : toolName
}

function normalizeResponsesFunctionCallArguments(
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
      return parsed as Record<string, unknown>
    }
  } catch {
    // Ignore malformed payloads and let downstream validation handle them.
  }

  return {}
}

function mapInternalToolInputToResponsesArguments(
  toolName: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (toolName !== BASH_TOOL_NAME) {
    return input
  }

  const command =
    typeof input.command === 'string' ? input.command.trim() : ''
  if (!command) {
    return input
  }

  const mapped: Record<string, unknown> = {
    command: ['bash', '-lc', command],
  }

  if (typeof input.timeout === 'number' && Number.isFinite(input.timeout)) {
    mapped.timeout_ms = input.timeout
  }

  return mapped
}

function buildResponsesFunctionCallInputItem(
  toolUseId: string,
  toolName: string,
  input: Record<string, unknown>,
): Extract<ResponsesInputItem, { type: 'function_call' }> {
  return {
    type: 'function_call',
    call_id: toolUseId,
    name: mapInternalToolNameToResponsesToolName(toolName),
    arguments: JSON.stringify(
      mapInternalToolInputToResponsesArguments(toolName, input),
    ),
  }
}

function extractShellInputFromLegacyPayload(
  payload: Extract<ResponsesInputItem, { type: 'local_shell_call' }>,
): Record<string, unknown> | null {
  const legacyCommand = payload.action.command
  const command =
    Array.isArray(legacyCommand) &&
    legacyCommand[0] === 'bash' &&
    legacyCommand[1] === '-lc' &&
    typeof legacyCommand[2] === 'string'
      ? legacyCommand[2]
      : typeof legacyCommand === 'string'
        ? legacyCommand
        : ''
  const timeout =
    typeof payload.action.timeout_ms === 'number' &&
    Number.isFinite(payload.action.timeout_ms)
      ? payload.action.timeout_ms
      : undefined
  const workingDirectory =
    typeof payload.action.working_directory === 'string' &&
    payload.action.working_directory.trim().length > 0
      ? payload.action.working_directory
      : undefined

  return command.trim().length > 0
    ? {
        command,
        ...(timeout !== undefined ? { timeout } : {}),
        ...(workingDirectory ? { workdir: workingDirectory } : {}),
      }
    : null
}

function extractShellInputFromShellCall(
  payload: Extract<ResponsesInputItem, { type: 'shell_call' }>,
): Record<string, unknown> | null {
  const commands = payload.action.commands.filter(
    command => typeof command === 'string' && command.trim().length > 0,
  )
  if (commands.length === 0) {
    return null
  }

  return {
    command: commands.join(' && '),
    ...(typeof payload.action.timeout_ms === 'number'
      ? { timeout: payload.action.timeout_ms }
      : {}),
    ...(typeof payload.action.working_directory === 'string' &&
    payload.action.working_directory.trim().length > 0
      ? { workdir: payload.action.working_directory }
      : {}),
  }
}

function extractShellOutputText(
  payload: Extract<ResponsesInputItem, { type: 'shell_call_output' }>,
): string {
  return payload.output
    .map(result => {
      const parts = [result.stdout, result.stderr].filter(
        text => typeof text === 'string' && text.length > 0,
      )
      return parts.join('\n')
    })
    .filter(text => text.length > 0)
    .join('\n')
}

function normalizeResponsesReplayInputItem(
  payload: ResponsesInputItem,
  toolNameByUseId: Map<string, string>,
): ResponsesInputItem | null {
  if (payload.type === 'function_call') {
    const internalToolName = mapResponsesToolNameToInternalToolName(
      payload.name,
    )
    toolNameByUseId.set(payload.call_id, internalToolName)
    return buildResponsesFunctionCallInputItem(
      payload.call_id,
      internalToolName,
      normalizeResponsesFunctionCallArguments(payload.arguments),
    )
  }

  if (payload.type === 'function_call_output') {
    return payload
  }

  if (payload.type === 'shell_call') {
    toolNameByUseId.set(payload.call_id, BASH_TOOL_NAME)
    const input = extractShellInputFromShellCall(payload)
    return input
      ? buildResponsesFunctionCallInputItem(
          payload.call_id,
          BASH_TOOL_NAME,
          input,
        )
      : null
  }

  if (payload.type === 'shell_call_output') {
    return {
      type: 'function_call_output',
      call_id: payload.call_id,
      output: extractShellOutputText(payload),
    }
  }

  if (payload.type === 'local_shell_call') {
    toolNameByUseId.set(payload.call_id, BASH_TOOL_NAME)
    const input = extractShellInputFromLegacyPayload(payload)
    if (!input) {
      return null
    }

    return buildResponsesFunctionCallInputItem(
      payload.call_id,
      BASH_TOOL_NAME,
      input,
    )
  }

  return payload
}

function buildResponsesInputFromTurnItems(
  turnItems: readonly ModelTurnItem[],
  toolNameByUseId: Map<string, string>,
): ResponsesInputItem[] {
  const items: ResponsesInputItem[] = []
  const hasOpaqueReasoning = turnItems.some(
    item => item.kind === 'opaque_reasoning',
  )
  const hasOpaqueCompaction = turnItems.some(
    item => item.kind === 'opaque_compaction',
  )

  for (const item of turnItems) {
    if (item.kind === 'raw_model_output') {
      const payload = item.payload
      const payloadType = getResponsesPayloadType(payload)
      if (
        (payloadType === 'reasoning' && hasOpaqueReasoning) ||
        (isResponsesCompactionType(payloadType) && hasOpaqueCompaction)
      ) {
        continue
      }
      if (payloadType) {
        const replayItem = normalizeResponsesReplayInputItem(
          payload as ResponsesInputItem,
          toolNameByUseId,
        )
        if (replayItem) {
          items.push(replayItem)
        }
      }
      continue
    }

    if (
      item.kind === 'opaque_reasoning' ||
      item.kind === 'opaque_compaction'
    ) {
      const payload = item.payload
      if (getResponsesPayloadType(payload)) {
        const replayItem = normalizeResponsesReplayInputItem(
          payload as ResponsesInputItem,
          toolNameByUseId,
        )
        if (replayItem) {
          items.push(replayItem)
        }
      }
    }
  }

  return items
}

function buildResponsesInput(
  messages: Message[],
  tools: Tools = [],
): ResponsesInputItem[] {
  const items: ResponsesInputItem[] = []
  const toolNameByUseId = new Map<string, string>()

  const normalizedMessages = ensureToolResultPairing(
    normalizeMessagesForAPI(messages, tools),
  )

  for (const message of normalizedMessages) {
    const replayItems = buildResponsesInputFromTurnItems(
      message.modelTurnItems ?? [],
      toolNameByUseId,
    )
    if (shouldPreferResponsesReplayItems(message, replayItems)) {
      items.push(...replayItems)
      continue
    }
    if (typeof message.message.content === 'string') {
      pushMessageInput(items, message.type, message.message.content)
      continue
    }

    if (message.type === 'assistant') {
      let pendingAssistantText = ''
      for (const block of message.message.content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          pendingAssistantText += block.text
          continue
        }

        if (block.type === 'tool_use') {
          pushMessageInput(items, 'assistant', pendingAssistantText)
          pendingAssistantText = ''
          const turnItems = buildToolCallItemsForLocalExecution(
            block.id,
            block.name,
            (block.input ?? {}) as Record<string, unknown>,
            'history',
          )
          const toolCall = turnItems.find(
            item => item.kind === 'tool_call',
          )
          if (toolCall?.kind === 'tool_call') {
            toolNameByUseId.set(toolCall.toolUseId, toolCall.toolName)
            items.push(
              buildResponsesFunctionCallInputItem(
                toolCall.toolUseId,
                toolCall.toolName,
                toolCall.input,
              ),
            )
          }
        }
      }

      pushMessageInput(items, 'assistant', pendingAssistantText)
      continue
    }

    let pendingUserText = ''
    const flushPendingUserText = () => {
      pushMessageInput(items, 'user', pendingUserText)
      pendingUserText = ''
    }
    for (const block of message.message.content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        const codexContextSections = extractCodexContextualUserSections(
          block.text,
        )
        if (codexContextSections) {
          flushPendingUserText()
          pushUserMessageInputSections(items, codexContextSections)
          continue
        }

        if (isContextualUserText(block.text)) {
          flushPendingUserText()
          pushUserMessageInputSections(items, [block.text])
          continue
        }
        pendingUserText += block.text
        continue
      }

      if (block.type === 'tool_result') {
        flushPendingUserText()
        const turnItems = buildToolResultItemsForLocalExecution(
          block.tool_use_id,
          toolNameByUseId.get(block.tool_use_id),
          block,
        )
        items.push({
          type: 'function_call_output',
          call_id: block.tool_use_id,
          output: getLocalExecutionOutputText(turnItems),
        })
      }
    }

    if (!message.message.content.length) {
      pushMessageInput(items, 'user', '')
      continue
    }

    flushPendingUserText()
  }

  return items
}

function shouldPreferResponsesReplayItems(
  message: Message,
  replayItems: readonly ResponsesInputItem[],
): boolean {
  if (replayItems.length === 0) {
    return false
  }

  if (typeof message.message.content === 'string') {
    const content = message.message.content.trim()
    return content.length === 0 || content === NO_CONTENT_MESSAGE
  }

  const hasRenderableContent = message.message.content.some(block => {
    if (block.type !== 'text' || typeof block.text !== 'string') {
      return true
    }
    const text = block.text.trim()
    return text.length > 0 && text !== NO_CONTENT_MESSAGE
  })

  if (!hasRenderableContent) {
    return true
  }

  // Keep replay-only meta entries such as native Responses compaction history
  // on the raw item path. Ordinary turns should flow back through the
  // Claude-style message content so the request looks like a conversation,
  // not a fully expanded execution log.
  return message.type === 'user' && message.isMeta === true
}

async function buildResponsesTools(
  tools: Tools,
  options: CodexRequestOptions,
): Promise<ResponsesRequestTool[]> {
  const scopedTools = tools.filter(tool => tool.name !== 'WebSearch')

  return Promise.all(
    scopedTools.map(async tool => {
      if (tool.name === BASH_TOOL_NAME) {
        return {
          type: 'function' as const,
          name: CODEX_SHELL_TOOL_NAME,
          description: CODEX_SHELL_TOOL_DESCRIPTION,
          strict: false as const,
          parameters: CODEX_SHELL_TOOL_PARAMETERS,
        }
      }

      return {
        type: 'function' as const,
        name: tool.name,
        description: await tool.prompt({
          getToolPermissionContext:
            options.getToolPermissionContext ?? (async () => ({})),
          tools: scopedTools,
          agents: options.agents ?? [],
          allowedAgentTypes: options.allowedAgentTypes,
        }),
        strict: false as const,
        parameters:
          'inputJSONSchema' in tool && tool.inputJSONSchema
            ? tool.inputJSONSchema
            : zodToJsonSchema(tool.inputSchema),
      }
    }),
  )
}

function getNativeWebSearchMode(
  tools: Tools,
  extraToolSchemas: CodexRequestOptions['extraToolSchemas'],
): 'live' | 'cached' | 'disabled' | null {
  const configuredMode = getCodexConfiguredWebSearchMode()
  if (configuredMode === 'disabled') {
    return 'disabled'
  }

  const needsNativeWebSearch =
    tools.some(tool => tool.name === 'WebSearch') ||
    (extraToolSchemas ?? []).some(
      schema =>
        schema?.type === 'web_search_20250305' &&
        schema.name === 'web_search',
    )

  if (!needsNativeWebSearch) {
    return null
  }

  return configuredMode ?? 'live'
}

function getNativeWebSearchAllowedDomains(
  extraToolSchemas: CodexRequestOptions['extraToolSchemas'],
): string[] {
  for (const schema of extraToolSchemas ?? []) {
    if (
      schema?.type !== 'web_search_20250305' ||
      schema.name !== 'web_search'
    ) {
      continue
    }

    return Array.isArray(schema.allowed_domains)
      ? schema.allowed_domains.filter(
          domain => typeof domain === 'string' && domain.trim().length > 0,
        )
      : []
  }

  return getCodexConfiguredWebSearchAllowedDomains() ?? []
}

function buildNativeWebSearchTool(
  tools: Tools,
  extraToolSchemas: CodexRequestOptions['extraToolSchemas'],
): ResponsesNativeWebSearchTool | null {
  const mode = getNativeWebSearchMode(tools, extraToolSchemas)
  if (!mode || mode === 'disabled') {
    return null
  }

  const allowedDomains = getNativeWebSearchAllowedDomains(extraToolSchemas)
  const location = getCodexConfiguredWebSearchLocation()
  const contextSize = getCodexConfiguredWebSearchContextSize()

  return {
    type: 'web_search',
    external_web_access: mode === 'live',
    ...(allowedDomains.length > 0
      ? {
          filters: {
            allowed_domains: allowedDomains,
          },
        }
      : {}),
    ...(location &&
    (location.country || location.region || location.city || location.timezone)
      ? {
          user_location: {
            type: 'approximate' as const,
            ...(location.country ? { country: location.country } : {}),
            ...(location.region ? { region: location.region } : {}),
            ...(location.city ? { city: location.city } : {}),
            ...(location.timezone ? { timezone: location.timezone } : {}),
          },
        }
      : {}),
    ...(contextSize ? { search_context_size: contextSize } : {}),
  }
}

function toResponsesReasoningEffort(
  model: string,
  effortValue: CodexRequestOptions['effortValue'],
): CodexResponsesEffort | undefined {
  if (
    effortValue !== 'low' &&
    effortValue !== 'medium' &&
    effortValue !== 'high' &&
    effortValue !== 'xhigh' &&
    effortValue !== 'max'
  ) {
    return undefined
  }

  const supportedLevels = getCodexSupportedEffortLevels(model)
  return supportedLevels.includes(effortValue) ? effortValue : undefined
}

function getResponsesReasoningSummary(
  model: string,
): CodexResponsesReasoningSummary | undefined {
  const configuredSummary = getCodexConfiguredReasoningSummary()
  if (configuredSummary) {
    return configuredSummary === 'none' ? undefined : configuredSummary
  }
  const summary = getCodexDefaultReasoningSummaryForModel(model)
  return summary === 'none' ? undefined : summary
}

function getResponsesTextControls(
  model: string,
): { verbosity: CodexResponsesVerbosity } | undefined {
  const verbosity = getCodexDefaultVerbosityForModel(model)
  return verbosity ? { verbosity } : undefined
}

function applyResponsesBodyDefaults({
  body,
  systemPrompt,
  tools,
  options,
  requestIdentity,
  resolvedModel,
}: {
  body: Record<string, unknown>
  systemPrompt: SystemPrompt
  tools: Tools
  options: CodexRequestOptions
  requestIdentity: ReturnType<typeof buildCodexRequestIdentity>
  resolvedModel: string
}): Record<string, unknown> {
  const profile = getCodexProviderProfile()

  if (requestIdentity.metadata) {
    body.metadata = requestIdentity.metadata
  }
  const responseStorage = getCodexConfiguredResponseStorage()
  if (typeof responseStorage === 'boolean') {
    body.store = responseStorage
  }

  const resolvedEffortValue = resolveAppliedEffort(
    resolvedModel,
    options.resolvedEffortValue ?? options.effortValue ?? undefined,
    options.permissionMode,
  )
  const effort = toResponsesReasoningEffort(
    resolvedModel,
    resolvedEffortValue,
  )
  if (profile.reasoningEffort && effort) {
    const summary = getResponsesReasoningSummary(resolvedModel)
    body.reasoning =
      summary === undefined
        ? { effort }
        : {
            effort,
            summary,
          }
    body.include = ['reasoning.encrypted_content']
  }

  const textControls = getResponsesTextControls(resolvedModel)
  if (textControls) {
    body.text = textControls
  }

  if (profile.instructionsField && systemPrompt.length > 0) {
    body.instructions = systemPrompt.join('\n\n')
  }

  body.prompt_cache_key = getSessionId()

  if (options.fastMode) {
    body.service_tier = 'priority'
  }

  return body
}

export async function buildResponsesCompactBody({
  messages,
  systemPrompt,
  tools: _tools,
  options,
}: Omit<CodexStreamingArgs, 'signal'>) {
  const resolvedModel =
    options.model ?? getCodexConfiguredModel() ?? DEFAULT_CODEX_MODEL

  const body: Record<string, unknown> = {
    model: resolvedModel,
    input: buildResponsesInput(messages, []),
  }

  const profile = getCodexProviderProfile()
  if (profile.instructionsField) {
    body.instructions = systemPrompt.join('\n\n')
  } else if (systemPrompt.length > 0) {
    body.input = [
      {
        type: 'message',
        role: 'developer',
        content: [{ type: 'input_text', text: systemPrompt.join('\n\n') }],
      },
      ...((body.input as ResponsesInputItem[]) ?? []),
    ]
  }
  const resolvedEffortValue = resolveAppliedEffort(
    resolvedModel,
    options.resolvedEffortValue ?? options.effortValue ?? undefined,
    options.permissionMode,
  )
  const effort = toResponsesReasoningEffort(
    resolvedModel,
    resolvedEffortValue,
  )
  if (profile.reasoningEffort && effort) {
    const summary = getResponsesReasoningSummary(resolvedModel)
    body.reasoning =
      summary === undefined
        ? { effort }
        : {
            effort,
            summary,
          }
    body.include = ['reasoning.encrypted_content']
  }

  const textControls = getResponsesTextControls(resolvedModel)
  if (textControls) {
    body.text = textControls
  }

  return body
}

export async function buildResponsesBody({
  messages,
  systemPrompt,
  tools,
  options,
}: Omit<CodexStreamingArgs, 'signal'>) {
  const profile = getCodexProviderProfile()
  const requestIdentity = buildCodexRequestIdentity()
  const resolvedTools = options.tools ?? tools ?? []
  const resolvedModel =
    options.model ?? getCodexConfiguredModel() ?? DEFAULT_CODEX_MODEL
  let input = buildResponsesInput(messages, resolvedTools)
  if (!profile.instructionsField && systemPrompt.length > 0) {
    const developerInput: ResponsesInputItem[] = []
    pushMessageInput(developerInput, 'developer', systemPrompt.join('\n\n'))
    input = [...developerInput, ...input]
  }
  const body: Record<string, unknown> = applyResponsesBodyDefaults({
    body: {
      model: resolvedModel,
      stream: true,
      input,
    },
    systemPrompt,
    tools: resolvedTools,
    options,
    requestIdentity,
    resolvedModel,
  })
  const responseTools: ResponsesRequestTool[] = [
    ...(() => {
      const nativeWebSearchTool = buildNativeWebSearchTool(
        resolvedTools,
        options.extraToolSchemas,
      )

      return nativeWebSearchTool ? [nativeWebSearchTool] : []
    })(),
    ...(resolvedTools.length > 0
      ? await buildResponsesTools(resolvedTools, {
          ...options,
          tools: resolvedTools,
        })
      : []),
  ]

  if (responseTools.length > 0) {
    body.tools = responseTools
    if (profile.toolChoice !== 'none') {
      body.tool_choice = profile.toolChoice
    }
    if (
      codexModelSupportsParallelToolCalls(resolvedModel) ||
      findCodexModelCapability(resolvedModel) === undefined
    ) {
      body.parallel_tool_calls = true
    }
  }

  // Enable prefix caching: use session ID as cache key so the upstream
  // provider can reuse cached prompt prefixes across turns in the same
  // conversation. Matches codex-rs behavior (core/src/client.rs:733).
  body.prompt_cache_key = getSessionId()

  // Fast mode: set service_tier to "priority" for faster response times.
  // Matches codex-rs behavior (core/src/client.rs:745-748).
  if (options.fastMode) {
    body.service_tier = 'priority'
  }

  return body
}

function normalizeSseBuffer(buffer: string): string {
  return buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function extractPayloadTextCandidatesFromSseBlock(block: string): string[] {
  const dataLines = normalizeSseBuffer(block)
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => {
      const value = line.slice('data:'.length)
      return value.startsWith(' ') ? value.slice(1) : value
    })

  if (dataLines.length === 0) {
    return []
  }

  const specPayloadText = dataLines.join('\n').trim()
  if (!specPayloadText || specPayloadText === '[DONE]') {
    return []
  }

  if (dataLines.length === 1) {
    return [specPayloadText]
  }

  // Some Codex relay paths split a single JSON payload across multiple
  // `data:` lines without respecting JSON string boundaries. Try the
  // spec-compliant join first, then a no-newline fallback.
  const concatenatedPayloadText = dataLines.join('').trim()
  if (
    concatenatedPayloadText &&
    concatenatedPayloadText !== '[DONE]' &&
    concatenatedPayloadText !== specPayloadText
  ) {
    return [specPayloadText, concatenatedPayloadText]
  }

  return [specPayloadText]
}

const DEFAULT_FIRST_EVENT_TIMEOUT_MS = 30_000
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 30_000
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_NETWORK_TOOL_TIMEOUT_MS = 90_000
const CODEX_RETRY_BASE_DELAY_MS = 200

class RetryableResponsesStreamError extends Error {
  readonly delayMs?: number

  constructor(message: string, delayMs?: number) {
    super(message)
    this.name = 'RetryableResponsesStreamError'
    this.delayMs = delayMs
  }
}

function parseTimeoutMs(
  raw: string | undefined,
  fallbackMs: number,
): number {
  if (!raw) return fallbackMs
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs
}

function hasNetworkFacingTool(tools: Tools | undefined): boolean {
  return (tools ?? []).some(
    tool => tool.name === 'WebSearch' || tool.name === 'WebFetch',
  )
}

function getTimeoutDefaultMs(
  tools: Tools | undefined,
  fallbackMs: number,
): number {
  return hasNetworkFacingTool(tools)
    ? Math.max(fallbackMs, DEFAULT_NETWORK_TOOL_TIMEOUT_MS)
    : fallbackMs
}

function getFirstEventTimeoutMs(tools: Tools | undefined): number {
  return parseTimeoutMs(
    process.env.CODEX_RESPONSES_FIRST_EVENT_TIMEOUT_MS,
    getTimeoutDefaultMs(
      tools,
      Math.max(DEFAULT_FIRST_EVENT_TIMEOUT_MS, getCodexStreamIdleTimeoutMs()),
    ),
  )
}

function getStreamIdleTimeoutMs(tools: Tools | undefined): number {
  return parseTimeoutMs(
    process.env.CODEX_RESPONSES_STREAM_IDLE_TIMEOUT_MS,
    getTimeoutDefaultMs(
      tools,
      Math.max(DEFAULT_STREAM_IDLE_TIMEOUT_MS, getCodexStreamIdleTimeoutMs()),
    ),
  )
}

function getRequestTimeoutMs(tools: Tools | undefined): number {
  return parseTimeoutMs(
    process.env.CODEX_RESPONSES_REQUEST_TIMEOUT_MS,
    getTimeoutDefaultMs(
      tools,
      Math.max(DEFAULT_REQUEST_TIMEOUT_MS, getCodexStreamIdleTimeoutMs()),
    ),
  )
}

function getRetryDelayMs(attempt: number): number {
  const exponentialDelay =
    CODEX_RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1))
  const jitterMultiplier = 0.9 + Math.random() * 0.2
  return Math.max(1, Math.round(exponentialDelay * jitterMultiplier))
}

function shouldRetryResponseStatus(status: number): boolean {
  return status >= 500
}

function maybeCancelResponseBody(response: Response): void {
  void response.body?.cancel().catch(() => {})
}

function parseRetryDelayMsFromFailureMessage(
  code: string | undefined,
  message: string | undefined,
): number | undefined {
  if (code !== 'rate_limit_exceeded' || !message) {
    return undefined
  }

  const match = message.match(
    /try again in\s*(\d+(?:\.\d+)?)\s*(s|ms|seconds?)/i,
  )
  if (!match?.[1] || !match[2]) {
    return undefined
  }

  const value = Number.parseFloat(match[1])
  if (!Number.isFinite(value) || value < 0) {
    return undefined
  }

  return match[2].toLowerCase() === 'ms'
    ? Math.round(value)
    : Math.round(value * 1000)
}

function classifyResponsesFailureEvent(event: ResponsesFailureEvent): {
  retryable: boolean
  message: string
  delayMs?: number
} {
  const errorDetails = event.error ?? event.response?.error
  const code = errorDetails?.code
  const message =
    errorDetails?.message ??
    event.detail ??
    event.message ??
    'custom Codex provider request failed'

  if (
    code === 'context_length_exceeded' ||
    code === 'insufficient_quota' ||
    code === 'usage_not_included' ||
    code === 'invalid_prompt' ||
    code === 'server_is_overloaded' ||
    code === 'slow_down'
  ) {
    return {
      retryable: false,
      message,
    }
  }

  return {
    retryable: true,
    message,
    delayMs: parseRetryDelayMsFromFailureMessage(code, message),
  }
}

async function fetchWithRequestTimeout(
  url: string,
  init: RequestInit,
  requestTimeoutMs: number,
  callerSignal: AbortSignal,
): Promise<Response> {
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => {
    timeoutController.abort()
  }, requestTimeoutMs)

  const combinedSignal =
    typeof AbortSignal.any === 'function'
      ? AbortSignal.any([callerSignal, timeoutController.signal])
      : callerSignal

  try {
    return await fetch(url, {
      ...init,
      signal: combinedSignal,
    })
  } catch (error) {
    if (callerSignal.aborted) {
      throw error
    }
    if (timeoutController.signal.aborted) {
      throw new Error(
        `Custom Codex provider request timed out (waiting for response) after ${requestTimeoutMs}ms`,
      )
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchWithRequestRetries(
  url: string,
  init: RequestInit,
  requestTimeoutMs: number,
  signal: AbortSignal,
): Promise<Response> {
  const maxRetries = getCodexRequestMaxRetries()

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    try {
      const response = await fetchWithRequestTimeout(
        url,
        init,
        requestTimeoutMs,
        signal,
      )

      if (
        response.ok ||
        !shouldRetryResponseStatus(response.status) ||
        attempt > maxRetries
      ) {
        return response
      }

      maybeCancelResponseBody(response)
    } catch (error) {
      if (signal.aborted || attempt > maxRetries) {
        throw error
      }
    }

    await sleep(getRetryDelayMs(attempt), signal)
  }

  throw new Error('custom Codex provider request failed without a response')
}

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
  timeoutLabel: string,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `Custom Codex provider stream timed out (${timeoutLabel}) after ${timeoutMs}ms`,
            ),
          )
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

export function parseResponsesSseEvent(
  block: string,
): ResponsesStreamEvent | null {
  if (!block.trim()) {
    return null
  }

  const payloadTextCandidates = extractPayloadTextCandidatesFromSseBlock(block)
  if (payloadTextCandidates.length === 0) {
    return null
  }

  let lastError: unknown
  for (const payloadText of payloadTextCandidates) {
    try {
      return JSON.parse(payloadText) as ResponsesStreamEvent
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

async function* iterateResponsesSseEvents(
  response: Response,
  tools: Tools | undefined,
): AsyncGenerator<ResponsesStreamEvent, void, unknown> {
  if (!response.body) {
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let seenEvent = false
  let completed = false

  while (true) {
    const timeoutMs = seenEvent
      ? getStreamIdleTimeoutMs(tools)
      : getFirstEventTimeoutMs(tools)
    const timeoutLabel = seenEvent
      ? 'waiting for next event'
      : 'waiting for first event'
    const { done, value } = await readWithTimeout(reader, timeoutMs, timeoutLabel)
    buffer = normalizeSseBuffer(
      buffer +
        decoder.decode(value ?? new Uint8Array(), {
          stream: !done,
        }),
    )

    let separatorIndex = buffer.indexOf('\n\n')
    while (separatorIndex !== -1) {
      const block = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      const payload = parseResponsesSseEvent(block)
      if (payload) {
        seenEvent = true
        if (payload.type === 'response.completed') {
          completed = true
        }
        yield payload
      }
      separatorIndex = buffer.indexOf('\n\n')
    }

    if (done) {
      break
    }
  }

  if (buffer.trim()) {
    const payload = parseResponsesSseEvent(buffer)
    if (payload) {
      seenEvent = true
      if (payload.type === 'response.completed') {
        completed = true
      }
      yield payload
    }
  }

  if (!completed) {
    throw new RetryableResponsesStreamError(
      'Custom Codex provider stream closed before response.completed',
    )
  }
}

export async function* queryCodexResponsesStream({
  messages,
  systemPrompt,
  tools,
  options,
  signal,
}: CodexStreamingArgs): AsyncGenerator<CodexResponseChunk, void, unknown> {
  const requestIdentity = buildCodexRequestIdentity()
  const requestTimeoutMs = getRequestTimeoutMs(tools)
  const streamMaxRetries = getCodexStreamMaxRetries()
  const requestBody = JSON.stringify(
    await buildResponsesBody({
      messages,
      systemPrompt,
      tools,
      options,
    }),
  )
  let streamRetryCount = 0

  while (true) {
    const startedTextBlocks = new Set<string>()
    const startedThinkingBlocks = new Set<string>()
    const seededAssistantTextByItemId = new Map<string, string>()
    const flushedAssistantTextByItemId = new Map<string, string>()
    const pendingFunctionCallArgumentsByItemId = new Map<string, string>()
    const pendingAssistantMessageById = new Map<
      string,
      ResponsesAssistantMessageItem
    >()
    const pendingAssistantMessageOrder: string[] = []
    let yieldedRetryUnsafeOutput = false

    const consumePendingAssistantTurnItems = (
      keepId?: string,
    ): ModelTurnItem[] => {
      if (pendingAssistantMessageOrder.length === 0) {
        return []
      }

      const turnItems: ModelTurnItem[] = []
      let writeIndex = 0

      for (const itemId of pendingAssistantMessageOrder) {
        const item = pendingAssistantMessageById.get(itemId)
        if (!item) {
          continue
        }

        if (keepId === itemId) {
          pendingAssistantMessageOrder[writeIndex] = itemId
          writeIndex += 1
          continue
        }

        pendingAssistantMessageById.delete(itemId)
        const assistantSeed = extractAssistantMessageSeed(item)
        if (!assistantSeed?.text) {
          continue
        }
        flushedAssistantTextByItemId.set(itemId, assistantSeed.text)
        turnItems.push(...normalizeResponsesOutputToTurnItems([item]))
      }

      pendingAssistantMessageOrder.length = writeIndex
      return turnItems
    }

    const ensurePendingAssistantMessage = (
      itemId: string,
    ): ResponsesAssistantMessageItem => {
      const existing = pendingAssistantMessageById.get(itemId)
      if (existing) {
        return existing
      }

      const synthetic = createPendingAssistantMessageItem(itemId)
      pendingAssistantMessageOrder.push(itemId)
      pendingAssistantMessageById.set(itemId, synthetic)
      return synthetic
    }

    const updatePendingAssistantMessageText = (
      itemId: string,
      textFragment: string,
    ): void => {
      if (textFragment.length === 0) {
        return
      }

      const currentItem = ensurePendingAssistantMessage(itemId)

      const currentText = extractAssistantMessageSeed(currentItem)?.text ?? ''
      const nextText = textFragment.startsWith(currentText)
        ? textFragment
        : `${currentText}${textFragment}`

      pendingAssistantMessageById.set(
        itemId,
        setAssistantMessageItemText(currentItem, nextText),
      )
    }

    const appendPendingFunctionCallArguments = (
      itemId: string,
      delta: string,
    ): void => {
      if (delta.length === 0) {
        return
      }

      pendingFunctionCallArgumentsByItemId.set(
        itemId,
        `${pendingFunctionCallArgumentsByItemId.get(itemId) ?? ''}${delta}`,
      )
    }

    const setPendingFunctionCallArguments = (
      itemId: string,
      argumentsText: string,
    ): void => {
      pendingFunctionCallArgumentsByItemId.set(itemId, argumentsText)
    }

    const applyPendingFunctionCallArguments = (
      item: ResponsesOutputItem,
    ): ResponsesOutputItem => {
      if (
        item.type !== 'function_call' ||
        typeof item.id !== 'string' ||
        item.id.length === 0
      ) {
        return item
      }

      const pendingArguments = pendingFunctionCallArgumentsByItemId.get(item.id)
      if (!pendingArguments) {
        return item
      }

      if (
        typeof item.arguments !== 'string' ||
        item.arguments.length === 0 ||
        pendingArguments.length >= item.arguments.length
      ) {
        return {
          ...item,
          arguments: pendingArguments,
        }
      }

      return item
    }

    try {
      const response = await fetchWithRequestRetries(
        getResponsesBaseUrl(),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(getResponsesApiKey()
              ? { authorization: `Bearer ${getResponsesApiKey()}` }
              : {}),
            'x-app': 'cli',
            ...requestIdentity.headers,
          },
          body: requestBody,
        },
        requestTimeoutMs,
        signal,
      )

      if (!response.ok) {
        const errorText = await response.text()
        yield {
          kind: 'api_error',
          errorMessage: formatCodexProviderApiError(
            `Custom Codex provider request failed: ${response.status} ${errorText}`,
          ),
        }
        return
      }

      for await (const event of iterateResponsesSseEvents(response, tools)) {
        if (event.type === 'response.content_part.added' && event.part) {
          if (event.part.type === 'output_text') {
            const outputIndex =
              typeof event.output_index === 'number' ? event.output_index : 0
            const contentIndex =
              typeof event.content_index === 'number' ? event.content_index : 0
            const blockKey = `${outputIndex}:${contentIndex}`
            if (startedTextBlocks.has(blockKey)) {
              continue
            }
            startedTextBlocks.add(blockKey)
            yield {
              kind: 'stream_event',
              event: {
                type: 'content_block_start',
                index: contentIndex,
                output_index: outputIndex,
                content_block: {
                  type: 'text',
                  text: '',
                },
              },
            }
          }
          continue
        }

        if (event.type === 'response.reasoning_summary_part.added') {
          const summaryIndex =
            typeof event.summary_index === 'number' ? event.summary_index : 0
          const outputIndex =
            typeof event.output_index === 'number' ? event.output_index : 0
          const blockKey = `thinking:${outputIndex}:${summaryIndex}`
          if (!startedThinkingBlocks.has(blockKey)) {
            startedThinkingBlocks.add(blockKey)
            yield {
              kind: 'stream_event',
              event: {
                type: 'content_block_start',
                index: summaryIndex,
                output_index: outputIndex,
                content_block: { type: 'thinking', thinking: '' },
              },
            }
          }
          continue
        }

        if (event.type === 'response.reasoning_summary_text.delta') {
          if (typeof event.delta === 'string' && event.delta.length > 0) {
            const summaryIndex =
              typeof event.summary_index === 'number' ? event.summary_index : 0
            const outputIndex =
              typeof event.output_index === 'number' ? event.output_index : 0
            const blockKey = `thinking:${outputIndex}:${summaryIndex}`
            if (!startedThinkingBlocks.has(blockKey)) {
              startedThinkingBlocks.add(blockKey)
              yield {
                kind: 'stream_event',
                event: {
                  type: 'content_block_start',
                  index: summaryIndex,
                  output_index: outputIndex,
                  content_block: { type: 'thinking', thinking: '' },
                },
              }
            }
            yield {
              kind: 'stream_event',
              event: {
                type: 'content_block_delta',
                index: summaryIndex,
                output_index: outputIndex,
                delta: { type: 'thinking_delta', thinking: event.delta },
              },
            }
          }
          continue
        }

        if (event.type === 'response.reasoning_summary_part.done') {
          const summaryIndex =
            typeof event.summary_index === 'number' ? event.summary_index : 0
          const outputIndex =
            typeof event.output_index === 'number' ? event.output_index : 0
          yield {
            kind: 'stream_event',
            event: {
              type: 'content_block_stop',
              index: summaryIndex,
              output_index: outputIndex,
            },
          }
          continue
        }

        if (event.type === 'response.output_text.delta') {
          if (typeof event.delta === 'string' && event.delta.length > 0) {
            let deltaText = event.delta
            if (typeof event.item_id === 'string') {
              updatePendingAssistantMessageText(event.item_id, event.delta)
              const seededText = seededAssistantTextByItemId.get(event.item_id)
              if (
                typeof seededText === 'string' &&
                deltaText.startsWith(seededText)
              ) {
                deltaText = deltaText.slice(seededText.length)
                seededAssistantTextByItemId.set(event.item_id, event.delta)
              }
            }

            if (!deltaText) {
              continue
            }

            const outputIndex =
              typeof event.output_index === 'number' ? event.output_index : 0
            const contentIndex =
              typeof event.content_index === 'number' ? event.content_index : 0
            const blockKey = `${outputIndex}:${contentIndex}`
            if (!startedTextBlocks.has(blockKey)) {
              startedTextBlocks.add(blockKey)
              yield {
                kind: 'stream_event',
                event: {
                  type: 'content_block_start',
                  index: contentIndex,
                  output_index: outputIndex,
                  content_block: {
                    type: 'text',
                    text: '',
                  },
                },
              }
            }
            yield {
              kind: 'stream_event',
              event: {
                type: 'content_block_delta',
                index: contentIndex,
                delta: {
                  type: 'text_delta',
                  text: deltaText,
                },
              },
            }
          }
          continue
        }

        if (event.type === 'response.function_call_arguments.delta') {
          if (
            typeof event.item_id === 'string' &&
            typeof event.delta === 'string'
          ) {
            appendPendingFunctionCallArguments(event.item_id, event.delta)
          }
          continue
        }

        if (event.type === 'response.function_call_arguments.done') {
          if (
            typeof event.item_id === 'string' &&
            typeof event.arguments === 'string'
          ) {
            setPendingFunctionCallArguments(event.item_id, event.arguments)
          }
          continue
        }

        if (event.type === 'response.output_item.added' && event.item) {
          if (
            event.item.type === 'function_call' &&
            typeof event.item.id === 'string' &&
            typeof event.item.arguments === 'string' &&
            event.item.arguments.length > 0
          ) {
            setPendingFunctionCallArguments(event.item.id, event.item.arguments)
          }

          if (!isResponsesAssistantMessageItem(event.item)) {
            const pendingTurnItems = consumePendingAssistantTurnItems()
            if (pendingTurnItems.length > 0) {
              yield {
                kind: 'turn_items',
                turnItems: pendingTurnItems,
              }
            }
          }

          const assistantSeed = extractAssistantMessageSeed(event.item)
          if (isResponsesAssistantMessageItem(event.item)) {
            if (!pendingAssistantMessageById.has(event.item.id)) {
              pendingAssistantMessageOrder.push(event.item.id)
            }
            const pendingSeed = extractAssistantMessageSeed(
              pendingAssistantMessageById.get(event.item.id),
            )
            const nextItem =
              !assistantSeed?.text && pendingSeed?.text
                ? setAssistantMessageItemText(
                    cloneAssistantMessageItem(event.item),
                    pendingSeed.text,
                  )
                : cloneAssistantMessageItem(event.item)
            pendingAssistantMessageById.set(
              event.item.id,
              nextItem,
            )
          }
          if (assistantSeed) {
            if (assistantSeed.id) {
              seededAssistantTextByItemId.set(
                assistantSeed.id,
                assistantSeed.text,
              )
            }
            yield {
              kind: 'stream_event',
              event: {
                type: 'content_block_start',
                index: 0,
                output_index: 0,
                content_block: {
                  type: 'text',
                  text: '',
                },
              },
            }
            yield {
              kind: 'stream_event',
              event: {
                type: 'content_block_delta',
                index: 0,
                output_index: 0,
                delta: {
                  type: 'text_delta',
                  text: assistantSeed.text,
                },
              },
            }
          }

          const turnItems =
            event.item.type === 'web_search_call'
              ? (() => {
                  const pendingTurnItems = consumePendingAssistantTurnItems()
                  return [
                    ...pendingTurnItems,
                    ...normalizeResponsesOutputToTurnItems([event.item]),
                  ]
                })()
              : []
          if (turnItems.length > 0) {
            if (turnItems.some(isRetryUnsafeTurnItem)) {
              yieldedRetryUnsafeOutput = true
            }
            yield {
              kind: 'turn_items',
              turnItems,
            }
          }
          continue
        }

        if (event.type === 'response.output_item.done' && event.item) {
          const normalizedDoneItem = applyPendingFunctionCallArguments(
            event.item,
          )
          const flushedAssistantText =
            isResponsesAssistantMessageItem(normalizedDoneItem)
              ? flushedAssistantTextByItemId.get(normalizedDoneItem.id)
              : undefined
          if (isResponsesAssistantMessageItem(normalizedDoneItem)) {
            const pendingTurnItems = consumePendingAssistantTurnItems(
              normalizedDoneItem.id,
            )
            if (pendingTurnItems.length > 0) {
              yield {
                kind: 'turn_items',
                turnItems: pendingTurnItems,
              }
            }
            pendingAssistantMessageById.delete(normalizedDoneItem.id)
            const pendingIndex = pendingAssistantMessageOrder.indexOf(
              normalizedDoneItem.id,
            )
            if (pendingIndex !== -1) {
              pendingAssistantMessageOrder.splice(pendingIndex, 1)
            }
          } else {
            const pendingTurnItems = consumePendingAssistantTurnItems()
            if (pendingTurnItems.length > 0) {
              yield {
                kind: 'turn_items',
                turnItems: pendingTurnItems,
              }
            }
          }

          const assistantSeed = extractAssistantMessageSeed(normalizedDoneItem)
          if (assistantSeed?.id) {
            seededAssistantTextByItemId.delete(assistantSeed.id)
          }
          if (isResponsesAssistantMessageItem(normalizedDoneItem)) {
            flushedAssistantTextByItemId.delete(normalizedDoneItem.id)
            if (
              typeof flushedAssistantText === 'string' &&
              assistantSeed?.text === flushedAssistantText
            ) {
              continue
            }
          }
          const normalizedItem =
            normalizedDoneItem.type === 'web_search_call' &&
            !normalizedDoneItem.status
              ? { ...normalizedDoneItem, status: 'completed' }
              : normalizedDoneItem
          if (
            normalizedItem.type === 'function_call' &&
            typeof normalizedItem.id === 'string'
          ) {
            pendingFunctionCallArgumentsByItemId.delete(normalizedItem.id)
          }
          const turnItems = normalizeResponsesOutputToTurnItems([normalizedItem])
          if (turnItems.length > 0) {
            if (turnItems.some(isRetryUnsafeTurnItem)) {
              yieldedRetryUnsafeOutput = true
            }
            yield {
              kind: 'turn_items',
              turnItems,
            }
          }
          continue
        }

        if (event.type === 'response.completed') {
          const pendingTurnItems = consumePendingAssistantTurnItems()
          if (pendingTurnItems.length > 0) {
            yield {
              kind: 'turn_items',
              turnItems: pendingTurnItems,
            }
          }
          if (event.response?.usage) {
            yield {
              kind: 'usage',
              usage: event.response.usage,
            }
          }
          return
        }

        if (event.type === 'response.incomplete') {
          const pendingTurnItems = consumePendingAssistantTurnItems()
          if (pendingTurnItems.length > 0) {
            yield {
              kind: 'turn_items',
              turnItems: pendingTurnItems,
            }
          }
          const reason =
            event.response?.incomplete_details?.reason?.trim() || 'unknown'
          yield {
            kind: 'api_error',
            errorMessage: formatCodexProviderApiError(
              `Incomplete response returned, reason: ${reason}`,
            ),
          }
          return
        }

        if (event.type === 'response.failed' || event.type === 'error') {
          const pendingTurnItems = consumePendingAssistantTurnItems()
          if (pendingTurnItems.length > 0) {
            yield {
              kind: 'turn_items',
              turnItems: pendingTurnItems,
            }
          }
          const failure = classifyResponsesFailureEvent(event)
          if (
            failure.retryable &&
            !yieldedRetryUnsafeOutput &&
            streamRetryCount < streamMaxRetries
          ) {
            throw new RetryableResponsesStreamError(
              failure.message,
              failure.delayMs,
            )
          }
          yield {
            kind: 'api_error',
            errorMessage: formatCodexProviderApiError(failure.message),
          }
          return
        }
      }

      return
    } catch (error) {
      if (signal.aborted) {
        return
      }

      if (
        error instanceof RetryableResponsesStreamError &&
        !yieldedRetryUnsafeOutput &&
        streamRetryCount < streamMaxRetries
      ) {
        streamRetryCount += 1
        const delayMs = error.delayMs ?? getRetryDelayMs(streamRetryCount)
        yield {
          kind: 'retry',
          message: `Reconnecting... ${streamRetryCount}/${streamMaxRetries}`,
          attempt: streamRetryCount,
          maxRetries: streamMaxRetries,
          delayMs,
        }
        await sleep(delayMs, signal)
        continue
      }

      yield {
        kind: 'api_error',
        errorMessage: formatCodexProviderApiError(
          `Custom Codex provider request failed: ${errorMessage(error)}`,
        ),
      }
      return
    }
  }
}

export async function queryCodexResponsesCompact({
  messages,
  systemPrompt,
  tools,
  options,
  signal,
}: CodexStreamingArgs): Promise<CodexCompactResponseResult> {
  const requestIdentity = buildCodexRequestIdentity()
  const requestTimeoutMs = getRequestTimeoutMs(tools)
  const requestBody = JSON.stringify(
    await buildResponsesCompactBody({
      messages,
      systemPrompt,
      tools,
      options,
    }),
  )

  try {
    const response = await fetchWithRequestRetries(
      getResponsesCompactBaseUrl(),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(getResponsesApiKey()
            ? { authorization: `Bearer ${getResponsesApiKey()}` }
            : {}),
          'x-app': 'cli',
          ...requestIdentity.headers,
        },
        body: requestBody,
      },
      requestTimeoutMs,
      signal,
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        formatCodexProviderApiError(
          `Custom Codex provider compact request failed: ${response.status} ${errorText}`,
        ),
      )
    }

    const payload = (await response.json()) as {
      output?: ResponsesOutputItem[]
    }
    if (!Array.isArray(payload.output)) {
      throw new Error(
        formatCodexProviderApiError(
          'Custom Codex provider compact response did not include an output array',
        ),
      )
    }

    const turnItems = normalizeResponsesOutputToTurnItems(payload.output)
    if (
      turnItems.some(
        item =>
          item.kind === 'tool_call' && !isLocalShellToolName(item.toolName),
      )
    ) {
      throw new Error(
        formatCodexProviderApiError(
          'Custom Codex provider compact response unexpectedly requested tool execution',
        ),
      )
    }

    return {
      outputItems: payload.output,
      turnItems,
    }
  } catch (error) {
    if (signal.aborted) {
      throw new Error(formatCodexProviderApiError('Request was aborted.'))
    }
    throw error
  }
}

export function shouldUseCodexResponsesAdapter(): boolean {
  return true
}

export async function queryCodexResponses({
  messages,
  systemPrompt,
  tools,
  options,
  signal,
}: CodexStreamingArgs): Promise<CodexResponseResult> {
  const turnItems: ModelTurnItem[] = []

  for await (const chunk of queryCodexResponsesStream({
    messages,
    systemPrompt,
    tools,
    options,
    signal,
  })) {
    if (chunk.kind === 'api_error') {
      return {
        turnItems,
        errorMessage: chunk.errorMessage,
      }
    }

    if (chunk.kind === 'retry') {
      continue
    }

    if (chunk.kind === 'usage') {
      // Track usage for non-streaming path
      import('./codexResponsesUsage.js').then(({ convertResponsesUsageToAnthropicAndTrack }) => {
        convertResponsesUsageToAnthropicAndTrack(chunk.usage, options.model as string | undefined)
      }).catch(() => {})
      continue
    }

    if (chunk.kind === 'stream_event') {
      continue
    }

    turnItems.push(...chunk.turnItems)
  }

  return { turnItems }
}

export { normalizeTextContent }

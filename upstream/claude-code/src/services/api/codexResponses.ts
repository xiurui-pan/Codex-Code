import type {
  ContentBlock,
  ContentBlockParam,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type { Tool, Tools } from '../../Tool.js'
import type { AgentDefinition } from '../../tools/AgentTool/loadAgentsDir.js'
import type { Message } from '../../types/message.js'
import {
  getCodexConfiguredApiKey,
  getCodexConfiguredWebSearchAllowedDomains,
  getCodexConfiguredBaseUrl,
  getCodexConfiguredWebSearchContextSize,
  getCodexConfiguredWebSearchLocation,
  getCodexConfiguredModel,
  getCodexConfiguredWebSearchMode,
  getCodexConfiguredResponseStorage,
} from '../../utils/codexConfig.js'
import { errorMessage } from '../../utils/errors.js'
import { normalizeMessagesForAPI } from '../../utils/messages.js'
import { DEFAULT_CODEX_MODEL } from '../../utils/model/codexModels.js'
import type { SystemPrompt } from '../../utils/systemPromptType.js'
import { zodToJsonSchema } from '../../utils/zodToJsonSchema.js'
import {
  type ModelTurnItem,
} from './modelTurnItems.js'
import {
  buildToolCallItemsForLocalExecution,
  buildToolResultItemsForLocalExecution,
  getLocalExecutionOutputText,
} from './localExecutionItems.js'
import {
  normalizeResponsesOutputToTurnItems,
  type ResponsesOutputItem,
} from './codexTurnItems.js'
import { buildCodexRequestIdentity } from './codexRequestIdentity.js'
import { getCodexProviderProfile } from './providerProfiles.js'

type CodexRequestOptions = {
  model?: string
  effortValue?: string | number | null
  getToolPermissionContext?: () => Promise<unknown>
  tools?: Tools
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

export type CodexResponseChunk = CodexTurnItemChunk | CodexApiErrorChunk

export type CodexResponseResult = {
  turnItems: ModelTurnItem[]
  errorMessage?: string
}

function buildFunctionCallStartedTurnItems(item: {
  name?: string
}): ModelTurnItem[] {
  if (!item.name) {
    return []
  }

  return [
    {
      kind: 'ui_message',
      provider: 'custom',
      level: 'info',
      text: `准备调用工具: ${item.name}`,
      source: 'tool_call_started',
    },
  ]
}

type ResponsesOutputText = {
  type: 'output_text'
  text?: string
}

type ResponsesInputText = {
  type: 'input_text'
  text: string
}

type ResponsesCompletedEvent = {
  type: 'response.completed'
  response?: {
    id?: string
  }
}

type ResponsesOutputDoneEvent = {
  type: 'response.output_item.done'
  item?: ResponsesOutputItem
}

type ResponsesOutputAddedEvent = {
  type: 'response.output_item.added'
  item?: ResponsesOutputItem
}

type ResponsesFailureEvent = {
  type: 'response.failed' | 'error'
  error?: {
    message?: string
  }
  detail?: string
  message?: string
}

type ResponsesStreamEvent =
  | ResponsesCompletedEvent
  | ResponsesOutputDoneEvent
  | ResponsesOutputAddedEvent
  | ResponsesFailureEvent
  | { type?: string }

type ResponsesInputItem =
  | {
      type: 'message'
      role: 'user'
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
      output: ResponsesInputText[]
    }

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

function getResponsesBaseUrl(): string {
  const baseUrl = getCodexConfiguredBaseUrl()
  if (!baseUrl) {
    throw new Error(
      'Codex Responses adapter missing configured base URL (.codex model_providers.<id>.base_url / ANTHROPIC_BASE_URL)',
    )
  }
  return `${baseUrl.replace(/\/$/, '')}/responses`
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
  role: 'user' | 'assistant',
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

function buildResponsesInput(
  messages: Message[],
  tools: Tools = [],
): ResponsesInputItem[] {
  const items: ResponsesInputItem[] = []
  const toolNameByUseId = new Map<string, string>()

  for (const message of normalizeMessagesForAPI(messages, tools)) {
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
            items.push({
              type: 'function_call',
              call_id: toolCall.toolUseId,
              name: toolCall.toolName,
              arguments: JSON.stringify(toolCall.input),
            })
          }
        }
      }

      pushMessageInput(items, 'assistant', pendingAssistantText)
      continue
    }

    let pendingUserText = ''
    for (const block of message.message.content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        pendingUserText += block.text
        continue
      }

      if (block.type === 'tool_result') {
        pushMessageInput(items, 'user', pendingUserText)
        pendingUserText = ''
        const turnItems = buildToolResultItemsForLocalExecution(
          block.tool_use_id,
          toolNameByUseId.get(block.tool_use_id),
          block,
        )
        items.push({
          type: 'function_call_output',
          call_id: block.tool_use_id,
          output: [
            {
              type: 'input_text',
              text: getLocalExecutionOutputText(turnItems),
            },
          ],
        })
      }
    }

    if (!message.message.content.length) {
      pushMessageInput(items, 'user', '')
      continue
    }

    pushMessageInput(items, 'user', pendingUserText)
  }

  return items
}

async function buildResponsesTools(
  tools: Tools,
  options: CodexRequestOptions,
): Promise<ResponsesFunctionTool[]> {
  const scopedTools = tools.filter(tool => tool.name !== 'WebSearch')

  return Promise.all(
    scopedTools.map(async tool => ({
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
    })),
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

function parseEffortValue(
  effortValue: CodexRequestOptions['effortValue'],
): 'low' | 'medium' | 'high' | 'max' | undefined {
  if (
    effortValue === 'low' ||
    effortValue === 'medium' ||
    effortValue === 'high' ||
    effortValue === 'max'
  ) {
    return effortValue
  }

  return undefined
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
  const body: Record<string, unknown> = {
    model: options.model ?? getCodexConfiguredModel() ?? DEFAULT_CODEX_MODEL,
    stream: true,
    input: buildResponsesInput(messages, resolvedTools),
  }
  if (requestIdentity.metadata) {
    body.metadata = requestIdentity.metadata
  }
  const responseStorage = getCodexConfiguredResponseStorage()
  if (typeof responseStorage === 'boolean') {
    body.store = responseStorage
  }

  const effort = parseEffortValue(options.effortValue)
  if (profile.reasoningEffort && effort) {
    body.reasoning = {
      effort,
      summary: 'auto',
    }
  }

  if (profile.instructionsField && systemPrompt.length > 0) {
    body.instructions = systemPrompt.join('\n\n')
  }

  const responseTools = [
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
  }

  return body
}

function extractPayloadTextFromSseBlock(block: string): string | null {
  const payloadText = block
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => line.slice('data: '.length))
    .join('\n')
    .trim()

  if (!payloadText || payloadText === '[DONE]') {
    return null
  }

  return payloadText
}

const DEFAULT_FIRST_EVENT_TIMEOUT_MS = 30_000
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 30_000
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_NETWORK_TOOL_TIMEOUT_MS = 90_000

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
    getTimeoutDefaultMs(tools, DEFAULT_FIRST_EVENT_TIMEOUT_MS),
  )
}

function getStreamIdleTimeoutMs(tools: Tools | undefined): number {
  return parseTimeoutMs(
    process.env.CODEX_RESPONSES_STREAM_IDLE_TIMEOUT_MS,
    getTimeoutDefaultMs(tools, DEFAULT_STREAM_IDLE_TIMEOUT_MS),
  )
}

function getRequestTimeoutMs(tools: Tools | undefined): number {
  return parseTimeoutMs(
    process.env.CODEX_RESPONSES_REQUEST_TIMEOUT_MS,
    getTimeoutDefaultMs(tools, DEFAULT_REQUEST_TIMEOUT_MS),
  )
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

  const payloadText = extractPayloadTextFromSseBlock(block)
  if (!payloadText) {
    return null
  }

  return JSON.parse(payloadText) as ResponsesStreamEvent
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

  while (true) {
    const timeoutMs = seenEvent
      ? getStreamIdleTimeoutMs(tools)
      : getFirstEventTimeoutMs(tools)
    const timeoutLabel = seenEvent
      ? 'waiting for next event'
      : 'waiting for first event'
    const { done, value } = await readWithTimeout(reader, timeoutMs, timeoutLabel)
    buffer += decoder.decode(value ?? new Uint8Array(), {
      stream: !done,
    })

    let separatorIndex = buffer.indexOf('\n\n')
    while (separatorIndex !== -1) {
      const block = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      const payload = parseResponsesSseEvent(block)
      if (payload) {
        seenEvent = true
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
      yield payload
    }
  }
}

export async function* queryCodexResponsesStream({
  messages,
  systemPrompt,
  tools,
  options,
  signal,
}: CodexStreamingArgs): AsyncGenerator<CodexResponseChunk, void, unknown> {
  try {
    const requestIdentity = buildCodexRequestIdentity()
    const requestTimeoutMs = getRequestTimeoutMs(tools)
    const response = await fetchWithRequestTimeout(getResponsesBaseUrl(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(getResponsesApiKey()
          ? { authorization: `Bearer ${getResponsesApiKey()}` }
          : {}),
        'x-app': 'cli',
        ...requestIdentity.headers,
      },
      body: JSON.stringify(
        await buildResponsesBody({
          messages,
          systemPrompt,
          tools,
          options,
        }),
      ),
    }, requestTimeoutMs, signal)

    if (!response.ok) {
      const errorText = await response.text()
      yield {
        kind: 'api_error',
        errorMessage: `Custom Codex provider request failed: ${response.status} ${errorText}`,
      }
      return
    }

    for await (const event of iterateResponsesSseEvents(response, tools)) {
      if (event.type === 'response.output_item.added' && event.item) {
        const turnItems =
          event.item.type === 'function_call'
            ? buildFunctionCallStartedTurnItems(event.item)
            : event.item.type === 'web_search_call'
              ? normalizeResponsesOutputToTurnItems([event.item])
              : []
        if (turnItems.length > 0) {
          yield {
            kind: 'turn_items',
            turnItems,
          }
        }
        continue
      }

      if (event.type === 'response.output_item.done' && event.item) {
        const normalizedItem =
          event.item.type === 'web_search_call' && !event.item.status
            ? { ...event.item, status: 'completed' }
            : event.item
        const turnItems = normalizeResponsesOutputToTurnItems([normalizedItem])
        if (turnItems.length > 0) {
          yield {
            kind: 'turn_items',
            turnItems,
          }
        }
        continue
      }

      if (event.type === 'response.failed' || event.type === 'error') {
        const errorMessage =
          event.error?.message ??
          event.detail ??
          event.message ??
          'custom Codex provider request failed'
        yield {
          kind: 'api_error',
          errorMessage,
        }
        return
      }
    }
  } catch (error) {
    // User-triggered cancellation should not be surfaced as provider failure.
    if (signal.aborted) {
      return
    }

    yield {
      kind: 'api_error',
      errorMessage: `Custom Codex provider request failed: ${errorMessage(error)}`,
    }
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

    turnItems.push(...chunk.turnItems)
  }

  return { turnItems }
}

export { normalizeTextContent }

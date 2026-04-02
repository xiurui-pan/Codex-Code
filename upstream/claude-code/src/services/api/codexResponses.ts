import type {
  ContentBlock,
  ContentBlockParam,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type { Tool, Tools } from '../../Tool.js'
import type { AgentDefinition } from '../../tools/AgentTool/loadAgentsDir.js'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import { FILE_READ_TOOL_NAME } from '../../tools/FileReadTool/prompt.js'
import { GLOB_TOOL_NAME } from '../../tools/GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../../tools/GrepTool/prompt.js'
import type { Message } from '../../types/message.js'
import {
  getCodexConfiguredApiKey,
  getCodexConfiguredBaseUrl,
  getCodexConfiguredModel,
  getCodexConfiguredResponseStorage,
} from '../../utils/codexConfig.js'
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
  agents?: AgentDefinition[]
  allowedAgentTypes?: string[]
}

type CodexStreamingArgs = {
  messages: Message[]
  systemPrompt: SystemPrompt
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

const CURRENT_PHASE_TOOL_NAMES = new Set([
  BASH_TOOL_NAME,
  FILE_READ_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
])

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

function buildResponsesInput(messages: Message[]): ResponsesInputItem[] {
  const items: ResponsesInputItem[] = []
  const toolNameByUseId = new Map<string, string>()

  for (const message of messages) {
    if (message.type !== 'user' && message.type !== 'assistant') {
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

function shouldExposeTool(tool: Tool): boolean {
  return CURRENT_PHASE_TOOL_NAMES.has(tool.name)
}

async function buildResponsesTools(
  tools: Tools,
  options: CodexRequestOptions,
): Promise<ResponsesFunctionTool[]> {
  const exposedTools = tools.filter(shouldExposeTool)
  const scopedTools = exposedTools.length > 0 ? exposedTools : tools

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
  options,
}: Omit<CodexStreamingArgs, 'signal'>) {
  const profile = getCodexProviderProfile()
  const requestIdentity = buildCodexRequestIdentity()
  const body: Record<string, unknown> = {
    model: options.model ?? getCodexConfiguredModel() ?? DEFAULT_CODEX_MODEL,
    stream: true,
    input: buildResponsesInput(messages),
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

  if (options.tools && options.tools.length > 0) {
    body.tools = await buildResponsesTools(options.tools, options)
    if (profile.toolChoice !== 'none') {
      body.tool_choice = profile.toolChoice
    }
    body.instructions = [
      body.instructions,
      'When a tool is needed, emit a structured tool call and stop. Do not simulate tool execution, and do not include made-up tool output in assistant text.',
    ]
      .filter(part => typeof part === 'string' && part.length > 0)
      .join('\n\n')
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
): AsyncGenerator<ResponsesStreamEvent, void, unknown> {
  if (!response.body) {
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), {
      stream: !done,
    })

    let separatorIndex = buffer.indexOf('\n\n')
    while (separatorIndex !== -1) {
      const block = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      const payload = parseResponsesSseEvent(block)
      if (payload) {
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
      yield payload
    }
  }
}

export async function* queryCodexResponsesStream({
  messages,
  systemPrompt,
  options,
  signal,
}: CodexStreamingArgs): AsyncGenerator<CodexResponseChunk, void, unknown> {
  const requestIdentity = buildCodexRequestIdentity()
  const response = await fetch(getResponsesBaseUrl(), {
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
        options,
      }),
    ),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text()
    yield {
      kind: 'api_error',
      errorMessage: `Custom Codex provider request failed: ${response.status} ${errorText}`,
    }
    return
  }

  for await (const event of iterateResponsesSseEvents(response)) {
    if (event.type === 'response.output_item.done' && event.item) {
      const turnItems = normalizeResponsesOutputToTurnItems([event.item])
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
}

export function shouldUseCodexResponsesAdapter(): boolean {
  return true
}

export async function queryCodexResponses({
  messages,
  systemPrompt,
  options,
  signal,
}: CodexStreamingArgs): Promise<CodexResponseResult> {
  const turnItems: ModelTurnItem[] = []

  for await (const chunk of queryCodexResponsesStream({
    messages,
    systemPrompt,
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

import { randomUUID } from 'crypto'
import type {
  ContentBlock,
  ContentBlockParam,
  ToolResultBlockParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type { Tool, Tools } from '../../Tool.js'
import type {
  AgentDefinition,
} from '../../tools/AgentTool/loadAgentsDir.js'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import { FILE_READ_TOOL_NAME } from '../../tools/FileReadTool/prompt.js'
import { GLOB_TOOL_NAME } from '../../tools/GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../../tools/GrepTool/prompt.js'
import type { AssistantMessage, Message } from '../../types/message.js'
import type { SystemPrompt } from '../../utils/systemPromptType.js'
import {
  createAssistantAPIErrorMessage,
  createAssistantMessage,
} from '../../utils/messages.js'
import { getAPIProvider } from '../../utils/model/providers.js'
import { zodToJsonSchema } from '../../utils/zodToJsonSchema.js'

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

type ResponsesOutputText = {
  type: 'output_text'
  text?: string
}

type ResponsesInputText = {
  type: 'input_text'
  text: string
}

type ResponsesMessageItem = {
  type: 'message'
  role?: string
  content?: ResponsesOutputText[]
}

type ResponsesFunctionCallItem = {
  type: 'function_call'
  call_id?: string
  name?: string
  arguments?: string | Record<string, unknown>
}

type ResponsesCompletedEvent = {
  type: 'response.completed'
  response?: {
    id?: string
  }
}

type ResponsesOutputDoneEvent = {
  type: 'response.output_item.done'
  item?: ResponsesMessageItem | ResponsesFunctionCallItem
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

type ParsedCodexCliToolCall = {
  prefixText: string
  toolName: string
  input: Record<string, unknown>
}

const CURRENT_PHASE_TOOL_NAMES = new Set([
  BASH_TOOL_NAME,
  FILE_READ_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
])

function isCurrentPhaseCodexProvider(): boolean {
  return getAPIProvider() === 'custom'
}

function getResponsesBaseUrl(): string {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) {
    throw new Error('custom Codex provider missing ANTHROPIC_BASE_URL')
  }
  return `${baseUrl.replace(/\/$/, '')}/responses`
}

function getResponsesApiKey(): string | null {
  return process.env.ANTHROPIC_API_KEY ?? null
}

function normalizeTextContent(content: string | ContentBlock[] | ContentBlockParam[]): string {
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
      return parsed as Record<string, unknown>
    }
  } catch {
    return {}
  }

  return {}
}

function buildResponsesInput(messages: Message[]): ResponsesInputItem[] {
  const items: ResponsesInputItem[] = []

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
          items.push({
            type: 'function_call',
            call_id: block.id,
            name: block.name,
            arguments: JSON.stringify(block.input ?? {}),
          })
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
        items.push({
          type: 'function_call_output',
          call_id: block.tool_use_id,
          output: [
            {
              type: 'input_text',
              text: normalizeToolResultText(block.content),
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

  for (let i = start; i < text.length; i += 1) {
    const char = text[i]

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
      return text.slice(start, i + 1)
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
): ParsedCodexCliToolCall | null {
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
    prefixText: '',
    toolName: BASH_TOOL_NAME,
    input,
  }
}

function extractShellCommandFromQuotedCode(
  text: string,
): ParsedCodexCliToolCall | null {
  const match = text.match(/code=(['"])([\s\S]*?)\1/)
  const command = match?.[2]?.trim()
  if (!command) {
    return null
  }

  return {
    prefixText: '',
    toolName: BASH_TOOL_NAME,
    input: { command },
  }
}

function extractShellCommandFromInlineCommand(
  text: string,
): ParsedCodexCliToolCall | null {
  const normalizedText = text.replaceAll('\\"', '"')
  const match = normalizedText.match(
    /(?:command|cmd)"?\s*:\s*(\[[\s\S]*?\]|"[\s\S]*?")/,
  )
  const rawValue = match?.[1]?.trim()
  if (!rawValue) {
    return null
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (typeof parsed === 'string') {
      return normalizeShellCommandFromPayload({ command: parsed })
    }
    if (Array.isArray(parsed)) {
      return normalizeShellCommandFromPayload({ command: parsed })
    }
  } catch {
    return null
  }

  return null
}

function extractCodexCliToolCall(
  text: string,
): ParsedCodexCliToolCall | null {
  if (!text.includes('to=shell') && !text.includes('code:')) {
    return null
  }

  const markerIndex = text.indexOf('to=shell')
  const searchStart = markerIndex === -1 ? 0 : markerIndex
  const payloadCandidates = [
    extractJsonObjectAfterMarker(text, 'code:'),
    extractBalancedJsonObject(text, searchStart),
  ]

  for (const payloadText of payloadCandidates) {
    if (!payloadText) {
      continue
    }

    let payload: unknown
    try {
      payload = JSON.parse(payloadText)
    } catch {
      continue
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      continue
    }

    const normalized = normalizeShellCommandFromPayload(
      payload as Record<string, unknown>,
    )
    if (!normalized) {
      continue
    }

    normalized.prefixText =
      markerIndex === -1 ? '' : text.slice(0, markerIndex).trim()
    return normalized
  }

  const quotedCode = extractShellCommandFromQuotedCode(text)
  if (quotedCode) {
    quotedCode.prefixText =
      markerIndex === -1 ? '' : text.slice(0, markerIndex).trim()
    return quotedCode
  }

  const inlineCommand = extractShellCommandFromInlineCommand(text)
  if (!inlineCommand) {
    return null
  }

  inlineCommand.prefixText =
    markerIndex === -1 ? '' : text.slice(0, markerIndex).trim()
  return inlineCommand
}

async function buildResponsesBody({
  messages,
  systemPrompt,
  options,
}: Omit<CodexStreamingArgs, 'signal'>) {
  const body: Record<string, unknown> = {
    model: options.model ?? process.env.ANTHROPIC_MODEL ?? 'gpt-5.4',
    stream: true,
    input: buildResponsesInput(messages),
  }

  const effort = parseEffortValue(options.effortValue)
  if (effort) {
    body.reasoning = {
      effort,
      summary: 'auto',
    }
  }

  if (systemPrompt.length > 0) {
    body.instructions = systemPrompt.join('\n\n')
  }

  if (options.tools && options.tools.length > 0) {
    body.tools = await buildResponsesTools(options.tools, options)
    body.tool_choice = 'auto'
    body.instructions = [
      body.instructions,
      'When a tool is needed, emit a tool call and stop. Do not simulate tool execution, and do not include made-up tool output in assistant text.',
    ]
      .filter(part => typeof part === 'string' && part.length > 0)
      .join('\n\n')
  }

  return body
}

function parseSsePayload(rawText: string): {
  responseId: string | null
  items: Array<ResponsesMessageItem | ResponsesFunctionCallItem>
  errorMessage: string | null
} {
  const items: Array<ResponsesMessageItem | ResponsesFunctionCallItem> = []
  let responseId: string | null = null
  let errorMessage: string | null = null

  for (const block of rawText.split('\n\n')) {
    if (!block.trim()) {
      continue
    }

    const payloadText = block
      .split('\n')
      .filter(line => line.startsWith('data: '))
      .map(line => line.slice('data: '.length))
      .join('\n')
      .trim()

    if (!payloadText || payloadText === '[DONE]') {
      continue
    }

    const payload = JSON.parse(payloadText) as ResponsesStreamEvent
    if (payload.type === 'response.output_item.done' && payload.item) {
      items.push(payload.item)
      continue
    }

    if (payload.type === 'response.completed') {
      responseId = payload.response?.id ?? responseId
      continue
    }

    if (payload.type === 'response.failed' || payload.type === 'error') {
      errorMessage =
        payload.error?.message ??
        payload.detail ??
        payload.message ??
        'custom Codex provider request failed'
    }
  }

  return {
    responseId,
    items,
    errorMessage,
  }
}

function buildAssistantMessage(
  items: Array<ResponsesMessageItem | ResponsesFunctionCallItem>,
): AssistantMessage {
  const content: ContentBlock[] = []

  for (const item of items) {
    if (item.type === 'message' && item.role === 'assistant') {
      const text = (item.content ?? [])
        .filter(
          part => part.type === 'output_text' && typeof part.text === 'string',
        )
        .map(part => part.text ?? '')
        .join('')

      if (text) {
        const parsedToolCall = extractCodexCliToolCall(text)
        if (parsedToolCall) {
          if (parsedToolCall.prefixText) {
            content.push({
              type: 'text',
              text: parsedToolCall.prefixText,
            })
          }
          content.push({
            type: 'tool_use',
            id: randomUUID(),
            name: parsedToolCall.toolName,
            input: parsedToolCall.input,
          } as ToolUseBlock)
          continue
        }
      }

      if (text) {
        content.push({
          type: 'text',
          text,
        })
      }
      continue
    }

    if (item.type === 'function_call' && item.call_id && item.name) {
      content.push({
        type: 'tool_use',
        id: item.call_id,
        name: item.name,
        input: normalizeToolArguments(item.arguments),
      } as ToolUseBlock)
    }
  }

  return createAssistantMessage({
    content,
  })
}

export function shouldUseCodexResponsesAdapter(): boolean {
  return isCurrentPhaseCodexProvider()
}

export async function queryCodexResponses({
  messages,
  systemPrompt,
  options,
  signal,
}: CodexStreamingArgs): Promise<AssistantMessage> {
  const response = await fetch(getResponsesBaseUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(getResponsesApiKey()
        ? { authorization: `Bearer ${getResponsesApiKey()}` }
        : {}),
      'x-app': 'cli',
      'x-claude-code-session-id': randomUUID(),
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
    return createAssistantAPIErrorMessage({
      content: `Custom Codex provider request failed: ${response.status} ${errorText}`,
      apiError: 'api_error',
      error: {
        type: 'api_error',
        message: errorText,
      },
    })
  }

  const payload = parseSsePayload(await response.text())
  if (payload.errorMessage) {
    return createAssistantAPIErrorMessage({
      content: payload.errorMessage,
      apiError: 'api_error',
      error: {
        type: 'api_error',
        message: payload.errorMessage,
      },
    })
  }

  return buildAssistantMessage(payload.items)
}

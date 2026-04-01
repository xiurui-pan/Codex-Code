import { randomUUID } from 'crypto'
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
import type { SystemPrompt } from '../../utils/systemPromptType.js'
import { createAssistantAPIErrorMessage } from '../../utils/messages.js'
import { zodToJsonSchema } from '../../utils/zodToJsonSchema.js'
import {
  buildAssistantMessageFromTurnItems,
  type ModelTurnItem,
} from './modelTurnItems.js'
import {
  normalizeResponsesOutputToTurnItems,
  type ResponsesOutputItem,
} from './codexTurnItems.js'
import { getCurrentProviderProfile } from './providerProfiles.js'

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
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) {
    throw new Error('custom Codex provider missing ANTHROPIC_BASE_URL')
  }
  return `${baseUrl.replace(/\/$/, '')}/responses`
}

function getResponsesApiKey(): string | null {
  return process.env.ANTHROPIC_API_KEY ?? null
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

async function buildResponsesBody({
  messages,
  systemPrompt,
  options,
}: Omit<CodexStreamingArgs, 'signal'>) {
  const profile = getCurrentProviderProfile()
  const body: Record<string, unknown> = {
    model: options.model ?? process.env.ANTHROPIC_MODEL ?? 'gpt-5.4',
    stream: true,
    input: buildResponsesInput(messages),
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

function parseSsePayload(rawText: string): {
  responseId: string | null
  items: ResponsesOutputItem[]
  errorMessage: string | null
  turnItems: ModelTurnItem[]
} {
  const items: ResponsesOutputItem[] = []
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
    turnItems: normalizeResponsesOutputToTurnItems(items),
  }
}

export function shouldUseCodexResponsesAdapter(): boolean {
  return getCurrentProviderProfile().turnAdapter === 'responses-api'
}

export async function queryCodexResponses({
  messages,
  systemPrompt,
  options,
  signal,
}: CodexStreamingArgs) {
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

  return buildAssistantMessageFromTurnItems(payload.turnItems)
}

export { normalizeTextContent }

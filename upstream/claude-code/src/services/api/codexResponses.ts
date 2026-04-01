import { randomUUID } from 'crypto'
import type { AssistantMessage, Message } from '../../types/message.js'
import type { SystemPrompt } from '../../utils/systemPromptType.js'
import {
  createAssistantAPIErrorMessage,
  createAssistantMessage,
} from '../../utils/messages.js'
import { getAPIProvider } from '../../utils/model/providers.js'

type CodexRequestOptions = {
  model?: string
  effortValue?: string | number | null
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

type ResponsesMessageItem = {
  type: 'message'
  role?: string
  content?: ResponsesOutputText[]
}

type ResponsesCompletedEvent = {
  type: 'response.completed'
  response?: {
    id?: string
  }
}

type ResponsesOutputDoneEvent = {
  type: 'response.output_item.done'
  item?: ResponsesMessageItem
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

function normalizePromptText(content: Message['message']['content']): string {
  if (typeof content === 'string') {
    return content
  }

  return content
    .map(block => {
      if (block.type === 'text') {
        return block.text
      }
      if (block.type === 'tool_result') {
        if (typeof block.content === 'string') {
          return block.content
        }
        if (Array.isArray(block.content)) {
          return block.content
            .map(item => ('text' in item && typeof item.text === 'string' ? item.text : ''))
            .join('\n')
        }
      }
      return ''
    })
    .filter(text => text.length > 0)
    .join('\n')
}

function buildResponsesInput(messages: Message[]) {
  return messages.flatMap(message => {
    if (message.type !== 'user' && message.type !== 'assistant') {
      return []
    }

    const text = normalizePromptText(message.message.content)
    if (!text.trim()) {
      return []
    }

    return [
      {
        type: 'message',
        role: message.type,
        content: [
          {
            type: 'input_text',
            text,
          },
        ],
      },
    ]
  })
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

function buildResponsesBody({
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

  return body
}

function parseSsePayload(rawText: string): {
  responseId: string | null
  items: ResponsesMessageItem[]
  errorMessage: string | null
} {
  const items: ResponsesMessageItem[] = []
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

function buildAssistantMessage(items: ResponsesMessageItem[]): AssistantMessage {
  const text = items
    .filter(item => item.type === 'message' && item.role === 'assistant')
    .flatMap(item => item.content ?? [])
    .filter(part => part.type === 'output_text' && typeof part.text === 'string')
    .map(part => part.text ?? '')
    .join('')

  return createAssistantMessage({
    content: text,
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
      buildResponsesBody({
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

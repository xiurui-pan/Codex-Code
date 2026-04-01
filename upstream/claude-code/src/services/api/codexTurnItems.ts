import { randomUUID } from 'crypto'
import type { ModelTurnItem } from './modelTurnItems.js'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import { buildToolCallItemsForLocalExecution } from './localExecutionItems.js'

type ResponsesOutputText = {
  type: 'output_text'
  text?: string
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

export type ResponsesOutputItem =
  | ResponsesMessageItem
  | ResponsesFunctionCallItem

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

export function normalizeResponsesOutputToTurnItems(
  items: ResponsesOutputItem[],
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
        text: 'Provider emitted a text fallback tool call; using temporary parser.',
        source: 'text_fallback_tool_call',
      })
      turnItems.push(
        ...buildToolCallItemsForLocalExecution(
          randomUUID(),
          fallbackToolCall.toolName,
          fallbackToolCall.input,
          'text_fallback',
        ),
      )
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

    turnItems.push({
      kind: 'final_answer',
      provider: 'custom',
      text,
      source: 'message_output_filtered',
    })
  }

  return turnItems
}

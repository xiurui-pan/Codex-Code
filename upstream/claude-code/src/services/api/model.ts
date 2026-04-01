import type { NonNullableUsage } from '../../entrypoints/sdk/sdkUtilityTypes.js'
import type { AssistantMessage } from '../../types/message.js'
import { getCodexConfiguredModel } from '../../utils/codexConfig.js'
import {
  createAssistantAPIErrorMessage,
  createAssistantMessage,
} from '../../utils/messages.js'
import { getModelMaxOutputTokens as getContextMaxOutputTokens } from '../../utils/context.js'
import type { SystemPrompt } from '../../utils/systemPromptType.js'
import {
  type CodexResponseChunk,
  type CodexResponseResult,
  queryCodexResponses,
  queryCodexResponsesStream,
} from './codexResponses.js'
import {
  buildAssistantMessageFromTurnItems,
  getRenderableModelTurnItems,
} from './modelTurnItems.js'

export type StreamingModelCaller = (
  args: Parameters<typeof queryCodexResponsesStream>[0],
) => AsyncGenerator<AssistantMessage, void, unknown>
export type NonStreamingModelCaller = (
  args: Parameters<typeof queryCodexResponses>[0],
) => Promise<AssistantMessage>
export type StreamingModelTurnCaller = typeof queryCodexResponsesStream
export type SingleTurnModelCallArgs = {
  systemPrompt: SystemPrompt
  userPrompt: string
  signal: AbortSignal
  options: Record<string, unknown>
}
export type ModelCaller = (
  args: SingleTurnModelCallArgs,
) => Promise<AssistantMessage>
export type SmallModelCaller = (
  args: SingleTurnModelCallArgs,
) => Promise<AssistantMessage>
export type ModelAccessVerifier = (
  apiKey?: string | null,
  throwOnError?: boolean,
) => Promise<boolean>
export type ModelOutputTokenResolver = typeof getContextMaxOutputTokens
export type UsageUpdater = (
  usage: Readonly<NonNullableUsage>,
  partUsage: Partial<NonNullableUsage> | undefined,
) => NonNullableUsage
export type UsageAccumulator = (
  totalUsage: Readonly<NonNullableUsage>,
  messageUsage: Readonly<NonNullableUsage>,
) => NonNullableUsage

function buildSingleTurnRequest(args: {
  systemPrompt: SystemPrompt
  userPrompt: string
  signal: AbortSignal
  options: Record<string, unknown>
}) {
  return {
    messages: [
      {
        type: 'user' as const,
        uuid: 'codex-provider-single-turn',
        message: {
          content: args.userPrompt,
        },
      },
    ],
    systemPrompt: args.systemPrompt,
    options: args.options,
    signal: args.signal,
  }
}

function codexResultToAssistantMessage(
  result: CodexResponseResult,
): AssistantMessage {
  if (result.errorMessage) {
    return createAssistantAPIErrorMessage({
      content: result.errorMessage,
      apiError: 'api_error',
      error: {
        type: 'api_error',
        message: result.errorMessage,
      },
    })
  }

  const renderableItems = getRenderableModelTurnItems(result.turnItems)
  if (renderableItems.length === 0) {
    return createAssistantMessage({ content: '' })
  }

  return buildAssistantMessageFromTurnItems(renderableItems)
}

function codexChunkToAssistantMessage(
  chunk: CodexResponseChunk,
): AssistantMessage | null {
  if (chunk.kind === 'api_error') {
    return createAssistantAPIErrorMessage({
      content: chunk.errorMessage,
      apiError: 'api_error',
      error: {
        type: 'api_error',
        message: chunk.errorMessage,
      },
    })
  }

  const renderableItems = getRenderableModelTurnItems(chunk.turnItems)
  if (renderableItems.length === 0) {
    return null
  }

  return buildAssistantMessageFromTurnItems(renderableItems)
}

export const callModelWithStreaming: StreamingModelCaller = async function* (
  args,
) {
  for await (const chunk of queryCodexResponsesStream(args)) {
    const assistantMessage = codexChunkToAssistantMessage(chunk)
    if (assistantMessage) {
      yield assistantMessage
    }
  }
}

export const callModelTurnWithStreaming: StreamingModelTurnCaller =
  queryCodexResponsesStream

export const callModelWithoutStreaming: NonStreamingModelCaller = async args =>
  codexResultToAssistantMessage(await queryCodexResponses(args))

export const callModel: ModelCaller = async args =>
  callModelWithoutStreaming(
    buildSingleTurnRequest({
      systemPrompt: args.systemPrompt,
      userPrompt: args.userPrompt,
      options: args.options,
      signal: args.signal,
    }),
  )

export const callSmallModel: SmallModelCaller = async args =>
  callModelWithoutStreaming(
    buildSingleTurnRequest({
      systemPrompt: args.systemPrompt,
      userPrompt: args.userPrompt,
      options: {
        ...(args.options ?? {}),
        model: args.options?.model ?? getCodexConfiguredModel(),
      },
      signal: args.signal,
    }),
  )

export const verifyModelAccess: ModelAccessVerifier = async (
  apiKey,
  throwOnError = false,
) => {
  const hasCodexEndpoint = Boolean(process.env.ANTHROPIC_BASE_URL)
  const hasApiKey =
    typeof apiKey === 'string'
      ? apiKey.trim().length > 0
      : Boolean(process.env.ANTHROPIC_API_KEY)

  if (hasCodexEndpoint && (hasApiKey || !process.env.CLAUDE_CODE_CODEX_ENV_KEY)) {
    return true
  }

  if (throwOnError) {
    throw new Error('Codex provider is not configured')
  }

  return false
}

export const getModelMaxOutputTokens: ModelOutputTokenResolver =
  getContextMaxOutputTokens

export const updateModelUsage: UsageUpdater = (usage, partUsage) => {
  if (!partUsage) {
    return { ...usage }
  }

  return {
    input_tokens:
      partUsage.input_tokens !== undefined && partUsage.input_tokens > 0
        ? partUsage.input_tokens
        : usage.input_tokens,
    cache_creation_input_tokens:
      partUsage.cache_creation_input_tokens !== undefined &&
      partUsage.cache_creation_input_tokens > 0
        ? partUsage.cache_creation_input_tokens
        : usage.cache_creation_input_tokens,
    cache_read_input_tokens:
      partUsage.cache_read_input_tokens !== undefined &&
      partUsage.cache_read_input_tokens > 0
        ? partUsage.cache_read_input_tokens
        : usage.cache_read_input_tokens,
    output_tokens: partUsage.output_tokens ?? usage.output_tokens,
    server_tool_use: {
      web_search_requests:
        partUsage.server_tool_use?.web_search_requests ??
        usage.server_tool_use.web_search_requests,
      web_fetch_requests:
        partUsage.server_tool_use?.web_fetch_requests ??
        usage.server_tool_use.web_fetch_requests,
    },
    service_tier: partUsage.service_tier ?? usage.service_tier,
    cache_creation: {
      ephemeral_1h_input_tokens:
        partUsage.cache_creation?.ephemeral_1h_input_tokens ??
        usage.cache_creation.ephemeral_1h_input_tokens,
      ephemeral_5m_input_tokens:
        partUsage.cache_creation?.ephemeral_5m_input_tokens ??
        usage.cache_creation.ephemeral_5m_input_tokens,
    },
    inference_geo: partUsage.inference_geo ?? usage.inference_geo,
    iterations: partUsage.iterations ?? usage.iterations,
    speed: partUsage.speed ?? usage.speed,
  }
}

export const accumulateModelUsage: UsageAccumulator = (
  totalUsage,
  messageUsage,
) => ({
  input_tokens: totalUsage.input_tokens + messageUsage.input_tokens,
  cache_creation_input_tokens:
    totalUsage.cache_creation_input_tokens +
    messageUsage.cache_creation_input_tokens,
  cache_read_input_tokens:
    totalUsage.cache_read_input_tokens + messageUsage.cache_read_input_tokens,
  output_tokens: totalUsage.output_tokens + messageUsage.output_tokens,
  server_tool_use: {
    web_search_requests:
      totalUsage.server_tool_use.web_search_requests +
      messageUsage.server_tool_use.web_search_requests,
    web_fetch_requests:
      totalUsage.server_tool_use.web_fetch_requests +
      messageUsage.server_tool_use.web_fetch_requests,
  },
  service_tier: messageUsage.service_tier,
  cache_creation: {
    ephemeral_1h_input_tokens:
      totalUsage.cache_creation.ephemeral_1h_input_tokens +
      messageUsage.cache_creation.ephemeral_1h_input_tokens,
    ephemeral_5m_input_tokens:
      totalUsage.cache_creation.ephemeral_5m_input_tokens +
      messageUsage.cache_creation.ephemeral_5m_input_tokens,
  },
  inference_geo: messageUsage.inference_geo,
  iterations: messageUsage.iterations,
  speed: messageUsage.speed,
})

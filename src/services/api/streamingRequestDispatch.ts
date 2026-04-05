import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
  BetaStopReason,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { Stream } from '@anthropic-ai/sdk/streaming.mjs'
import { randomUUID } from 'crypto'
import {
  getAPIProvider,
  isFirstPartyAnthropicBaseUrl,
} from 'src/utils/model/providers.js'
import type { QuerySource } from 'src/constants/querySource.js'
import type { QueryChainTracking, ToolPermissionContext } from '../../Tool.js'
import type {
  AssistantMessage,
  SystemAPIErrorMessage,
} from '../../types/message.js'
import type { ConnectorTextBlock } from '../../types/connectorText.js'
import { captureAPIRequest } from '../../utils/log.js'
import { isFastModeEnabled } from 'src/utils/fastMode.js'
import { headlessProfilerCheckpoint } from 'src/utils/headlessProfiler.js'
import { queryCheckpoint } from 'src/utils/queryProfiler.js'
import type { ThinkingConfig } from 'src/utils/thinking.js'
import { CLIENT_REQUEST_ID_HEADER, getAnthropicClient } from './client.js'
import {
  EMPTY_USAGE,
  logAPIQuery,
  type NonNullableUsage,
} from './logging.js'
import { type RetryContext, withRetry } from './withRetry.js'
import type { ClientOptions } from '@anthropic-ai/sdk'
import type { AgentId } from 'src/types/ids.js'

type DispatchOptionsLike = {
  model: string
  fetchOverride?: ClientOptions['fetch']
  querySource: QuerySource
  queryTracking?: QueryChainTracking
  temperatureOverride?: number
  fallbackModel?: string
  agentId?: AgentId
  getToolPermissionContext: () => Promise<ToolPermissionContext>
}

export type StreamingAccumulatorState = {
  newMessages: AssistantMessage[]
  ttftMs: number
  partialMessage: BetaMessage | undefined
  contentBlocks: (BetaContentBlock | ConnectorTextBlock)[]
  usage: NonNullableUsage
  stopReason: BetaStopReason | null
  isAdvisorInProgress: boolean
}

export type StreamingRequestDispatchContext = {
  options: DispatchOptionsLike
  signal: AbortSignal
  thinkingConfig: ThinkingConfig
  previousRequestId?: string
  useBetas: boolean
  isFastMode: boolean
  paramsFromContext: (retryContext: RetryContext) => BetaMessageStreamParams
}

export type StreamingRequestDispatchResult = {
  stream: Stream<BetaRawMessageStreamEvent>
  start: number
  attemptNumber: number
  attemptStartTimes: number[]
  maxOutputTokens: number
  clientRequestId: string | undefined
  streamRequestId: string | null | undefined
  streamResponse: Response | undefined
  isFastModeRequest: boolean
  accumulatorState: StreamingAccumulatorState
}

export function createStreamingAccumulatorState(): StreamingAccumulatorState {
  return {
    newMessages: [],
    ttftMs: 0,
    partialMessage: undefined,
    contentBlocks: [],
    usage: EMPTY_USAGE,
    stopReason: null,
    isAdvisorInProgress: false,
  }
}

export async function* dispatchStreamingRequest(
  context: StreamingRequestDispatchContext,
): AsyncGenerator<SystemAPIErrorMessage, StreamingRequestDispatchResult, void> {
  {
    const queryParams = context.paramsFromContext({
      model: context.options.model,
      thinkingConfig: context.thinkingConfig,
    })
    const logMessagesLength = queryParams.messages.length
    const logBetas = context.useBetas ? (queryParams.betas ?? []) : []
    const logThinkingType = queryParams.thinking?.type ?? 'disabled'
    const logEffortValue = queryParams.output_config?.effort
    void context.options
      .getToolPermissionContext()
      .then(permissionContext => {
        logAPIQuery({
          model: context.options.model,
          messagesLength: logMessagesLength,
          temperature: context.options.temperatureOverride ?? 1,
          betas: logBetas,
          permissionMode: permissionContext.mode,
          querySource: context.options.querySource,
          queryTracking: context.options.queryTracking,
          thinkingType: logThinkingType,
          effortValue: logEffortValue,
          fastMode: context.isFastMode,
          previousRequestId: context.previousRequestId,
        })
      })
  }

  let start = Date.now()
  let attemptNumber = 0
  const attemptStartTimes: number[] = []
  let maxOutputTokens = 0
  let streamRequestId: string | null | undefined = undefined
  let clientRequestId: string | undefined = undefined
  let streamResponse: Response | undefined = undefined
  let isFastModeRequest = context.isFastMode

  queryCheckpoint('query_client_creation_start')
  const generator = withRetry(
    () =>
      getAnthropicClient({
        maxRetries: 0,
        model: context.options.model,
        fetchOverride: context.options.fetchOverride,
        source: context.options.querySource,
      }),
    async (anthropic, attempt, retryContext) => {
      attemptNumber = attempt
      isFastModeRequest = retryContext.fastMode ?? false
      start = Date.now()
      attemptStartTimes.push(start)
      queryCheckpoint('query_client_creation_end')

      const params = context.paramsFromContext(retryContext)
      captureAPIRequest(params, context.options.querySource)

      maxOutputTokens = params.max_tokens

      queryCheckpoint('query_api_request_sent')
      if (!context.options.agentId) {
        headlessProfilerCheckpoint('api_request_sent')
      }

      clientRequestId =
        getAPIProvider() === 'firstParty' && isFirstPartyAnthropicBaseUrl()
          ? randomUUID()
          : undefined

      const result = await anthropic.beta.messages
        .create(
          { ...params, stream: true },
          {
            signal: context.signal,
            ...(clientRequestId && {
              headers: { [CLIENT_REQUEST_ID_HEADER]: clientRequestId },
            }),
          },
        )
        .withResponse()
      queryCheckpoint('query_response_headers_received')
      streamRequestId = result.request_id
      streamResponse = result.response
      return result.data
    },
    {
      model: context.options.model,
      fallbackModel: context.options.fallbackModel,
      thinkingConfig: context.thinkingConfig,
      ...(isFastModeEnabled() ? { fastMode: context.isFastMode } : false),
      signal: context.signal,
      querySource: context.options.querySource,
    },
  )

  let event
  do {
    event = await generator.next()
    if (!('controller' in event.value)) {
      yield event.value
    }
  } while (!event.done)

  return {
    stream: event.value as Stream<BetaRawMessageStreamEvent>,
    start,
    attemptNumber,
    attemptStartTimes,
    maxOutputTokens,
    clientRequestId,
    streamRequestId,
    streamResponse,
    isFastModeRequest,
    accumulatorState: createStreamingAccumulatorState(),
  }
}

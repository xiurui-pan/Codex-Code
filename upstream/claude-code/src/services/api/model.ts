import {
  accumulateUsage,
  getMaxOutputTokensForModel,
  queryHaiku,
  queryModelWithStreaming,
  queryModelWithoutStreaming,
  queryWithModel,
  updateUsage,
  verifyApiKey,
} from './claude.js'
import {
  queryCodexResponses,
  shouldUseCodexResponsesAdapter,
} from './codexResponses.js'

export type StreamingModelCaller = typeof queryModelWithStreaming
export type NonStreamingModelCaller = typeof queryModelWithoutStreaming
export type ModelCaller = typeof queryWithModel
export type SmallModelCaller = typeof queryHaiku
export type ModelAccessVerifier = typeof verifyApiKey
export type ModelOutputTokenResolver = typeof getMaxOutputTokensForModel
export type UsageUpdater = typeof updateUsage
export type UsageAccumulator = typeof accumulateUsage

export const callModelWithStreaming: StreamingModelCaller = async function* (
  args,
) {
  if (!shouldUseCodexResponsesAdapter()) {
    return yield* queryModelWithStreaming(args)
  }

  yield await queryCodexResponses(args)
}

export const callModelWithoutStreaming: NonStreamingModelCaller = async args => {
  if (!shouldUseCodexResponsesAdapter()) {
    return queryModelWithoutStreaming(args)
  }

  return queryCodexResponses(args)
}

export const callModel: ModelCaller = async args => {
  if (!shouldUseCodexResponsesAdapter()) {
    return queryWithModel(args)
  }

  return queryCodexResponses({
    messages: [
      {
        type: 'user',
        uuid: 'codex-provider-query-with-model',
        message: {
          content: args.userPrompt,
        },
      },
    ],
    systemPrompt: args.systemPrompt,
    options: args.options,
    signal: args.signal,
  })
}

export const callSmallModel: SmallModelCaller = async args => {
  if (!shouldUseCodexResponsesAdapter()) {
    return queryHaiku(args)
  }

  return queryCodexResponses({
    messages: [
      {
        type: 'user',
        uuid: 'codex-provider-small-model',
        message: {
          content: args.userPrompt,
        },
      },
    ],
    systemPrompt: args.systemPrompt,
    options: {
      ...args.options,
      model: process.env.ANTHROPIC_MODEL,
    },
    signal: args.signal,
  })
}
export const verifyModelAccess: ModelAccessVerifier = verifyApiKey
export const getModelMaxOutputTokens: ModelOutputTokenResolver =
  getMaxOutputTokensForModel
export const updateModelUsage: UsageUpdater = updateUsage
export const accumulateModelUsage: UsageAccumulator = accumulateUsage

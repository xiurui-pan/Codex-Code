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

export type StreamingModelCaller = typeof queryModelWithStreaming
export type NonStreamingModelCaller = typeof queryModelWithoutStreaming
export type ModelCaller = typeof queryWithModel
export type SmallModelCaller = typeof queryHaiku
export type ModelAccessVerifier = typeof verifyApiKey
export type ModelOutputTokenResolver = typeof getMaxOutputTokensForModel
export type UsageUpdater = typeof updateUsage
export type UsageAccumulator = typeof accumulateUsage

export const callModelWithStreaming: StreamingModelCaller =
  queryModelWithStreaming
export const callModelWithoutStreaming: NonStreamingModelCaller =
  queryModelWithoutStreaming
export const callModel: ModelCaller = queryWithModel
export const callSmallModel: SmallModelCaller = queryHaiku
export const verifyModelAccess: ModelAccessVerifier = verifyApiKey
export const getModelMaxOutputTokens: ModelOutputTokenResolver =
  getMaxOutputTokensForModel
export const updateModelUsage: UsageUpdater = updateUsage
export const accumulateModelUsage: UsageAccumulator = accumulateUsage

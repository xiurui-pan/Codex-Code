import {
  queryHaiku,
  queryModelWithStreaming,
  queryModelWithoutStreaming,
  queryWithModel,
  verifyApiKey,
} from './claude.js'

export type StreamingModelCaller = typeof queryModelWithStreaming
export type NonStreamingModelCaller = typeof queryModelWithoutStreaming
export type ModelCaller = typeof queryWithModel
export type SmallModelCaller = typeof queryHaiku
export type ModelAccessVerifier = typeof verifyApiKey

export const callModelWithStreaming: StreamingModelCaller =
  queryModelWithStreaming
export const callModelWithoutStreaming: NonStreamingModelCaller =
  queryModelWithoutStreaming
export const callModel: ModelCaller = queryWithModel
export const callSmallModel: SmallModelCaller = queryHaiku
export const verifyModelAccess: ModelAccessVerifier = verifyApiKey

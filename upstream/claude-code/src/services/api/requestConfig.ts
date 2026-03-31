import {
  getAPIMetadata,
  getCacheControl,
  getExtraBodyParams,
} from './claude.js'

export type APIMetadataGetter = typeof getAPIMetadata
export type ExtraBodyParamsGetter = typeof getExtraBodyParams
export type CacheControlGetter = typeof getCacheControl

export const getRequestMetadata: APIMetadataGetter = getAPIMetadata
export const getRequestExtraBodyParams: ExtraBodyParamsGetter =
  getExtraBodyParams
export const getRequestCacheControl: CacheControlGetter = getCacheControl

import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/index.js'
import { isEnvTruthy } from '../envUtils.js'

export type APIProvider =
  | 'firstParty'
  | 'bedrock'
  | 'vertex'
  | 'foundry'
  | 'custom'

export function isCodexOnlyProviderEnabled(): boolean {
  return isEnvTruthy(process.env.CODEX_CODE_USE_CODEX_PROVIDER)
}

export function getAPIProvider(): APIProvider {
  return isCodexOnlyProviderEnabled()
    ? 'custom'
    : isEnvTruthy(process.env.CODEX_CODE_USE_BEDROCK)
    ? 'bedrock'
    : isEnvTruthy(process.env.CODEX_CODE_USE_VERTEX)
      ? 'vertex'
      : isEnvTruthy(process.env.CODEX_CODE_USE_FOUNDRY)
        ? 'foundry'
        : process.env.ANTHROPIC_BASE_URL
          ? 'custom'
          : 'firstParty'
}

export function getAPIProviderForStatsig(): AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  return getAPIProvider() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
}

export function shouldUseAnthropicFirstPartyApiFeatures(): boolean {
  return getAPIProvider() === 'firstParty' && isFirstPartyAnthropicBaseUrl()
}

/**
 * Check if ANTHROPIC_BASE_URL is a first-party Anthropic API URL.
 * Returns true if not set (default API) or points to api.anthropic.com
 * (or api-staging.anthropic.com for ant users).
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  if (isCodexOnlyProviderEnabled()) {
    return false
  }

  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) {
    return true
  }
  try {
    const host = new URL(baseUrl).host
    const allowedHosts = ['api.anthropic.com']
    if (process.env.USER_TYPE === 'ant') {
      allowedHosts.push('api-staging.anthropic.com')
    }
    return allowedHosts.includes(host)
  } catch {
    return false
  }
}

import {
  getDefaultCodexConfigPath,
  hasCodexConfigInEnv,
} from './codexConfig.js'
import { getAPIProvider, isFirstPartyAnthropicBaseUrl } from './model/providers.js'

export function isCurrentPhaseCustomCodexProvider(): boolean {
  return (
    hasCodexConfigInEnv() &&
    getAPIProvider() === 'custom' &&
    !isFirstPartyAnthropicBaseUrl()
  )
}

export function getCurrentPhaseProviderError(): string | null {
  if (isCurrentPhaseCustomCodexProvider()) {
    return null
  }

  return `当前阶段只支持自定义 Codex provider API。请检查 ${getDefaultCodexConfigPath()} 中的 model_provider、model、model_reasoning_effort 和 model_providers.<id>.base_url/env_key，并避免使用 claude.ai 登录、OAuth、Bridge、assistant mode、proactive 等 Anthropic 专属链路。`
}

export function isCurrentPhaseAnthropicPathEnabled(): boolean {
  return false
}

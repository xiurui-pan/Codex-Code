import { getAPIProvider, type APIProvider } from '../../utils/model/providers.js'

export type ProviderTurnAdapter = 'anthropic-messages' | 'responses-api'
export type ProviderToolCallMode =
  | 'anthropic-tool-use'
  | 'structured-function-call'
  | 'structured-function-call-with-text-fallback'

export type ProviderProfile = {
  provider: APIProvider
  turnAdapter: ProviderTurnAdapter
  reasoningEffort: boolean
  instructionsField: boolean
  structuredToolCalls: boolean
  toolChoice: 'none' | 'auto'
  toolCallMode: ProviderToolCallMode
  explicitPermissionEvents: boolean
}

const PROVIDER_PROFILES: Record<APIProvider, ProviderProfile> = {
  firstParty: {
    provider: 'firstParty',
    turnAdapter: 'anthropic-messages',
    reasoningEffort: false,
    instructionsField: false,
    structuredToolCalls: false,
    toolChoice: 'none',
    toolCallMode: 'anthropic-tool-use',
    explicitPermissionEvents: false,
  },
  bedrock: {
    provider: 'bedrock',
    turnAdapter: 'anthropic-messages',
    reasoningEffort: false,
    instructionsField: false,
    structuredToolCalls: false,
    toolChoice: 'none',
    toolCallMode: 'anthropic-tool-use',
    explicitPermissionEvents: false,
  },
  vertex: {
    provider: 'vertex',
    turnAdapter: 'anthropic-messages',
    reasoningEffort: false,
    instructionsField: false,
    structuredToolCalls: false,
    toolChoice: 'none',
    toolCallMode: 'anthropic-tool-use',
    explicitPermissionEvents: false,
  },
  foundry: {
    provider: 'foundry',
    turnAdapter: 'anthropic-messages',
    reasoningEffort: false,
    instructionsField: false,
    structuredToolCalls: false,
    toolChoice: 'none',
    toolCallMode: 'anthropic-tool-use',
    explicitPermissionEvents: false,
  },
  custom: {
    provider: 'custom',
    turnAdapter: 'responses-api',
    reasoningEffort: true,
    instructionsField: true,
    structuredToolCalls: true,
    toolChoice: 'auto',
    toolCallMode: 'structured-function-call-with-text-fallback',
    explicitPermissionEvents: true,
  },
}

export function getProviderProfile(provider: APIProvider): ProviderProfile {
  return PROVIDER_PROFILES[provider]
}

export function getCurrentProviderProfile(): ProviderProfile {
  return getProviderProfile(getAPIProvider())
}

export type CodexTurnAdapter = 'responses-api'
export type CodexToolCallMode = 'structured-function-call-with-text-fallback'

export type CodexProviderProfile = {
  provider: 'custom'
  turnAdapter: CodexTurnAdapter
  reasoningEffort: true
  instructionsField: true
  structuredToolCalls: true
  toolChoice: 'auto'
  toolCallMode: CodexToolCallMode
  explicitPermissionEvents: true
}

const CODEX_PROVIDER_PROFILE: CodexProviderProfile = {
  provider: 'custom',
  turnAdapter: 'responses-api',
  reasoningEffort: true,
  instructionsField: true,
  structuredToolCalls: true,
  toolChoice: 'auto',
  toolCallMode: 'structured-function-call-with-text-fallback',
  explicitPermissionEvents: true,
}

export function getCodexProviderProfile(): CodexProviderProfile {
  return CODEX_PROVIDER_PROFILE
}

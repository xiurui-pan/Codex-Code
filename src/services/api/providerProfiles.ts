export type CodexTurnAdapter = 'responses-api'
export type CodexToolCallMode = 'structured-function-call-with-text-fallback'

export type CodexProviderProfile = {
  provider: 'custom'
  turnAdapter: CodexTurnAdapter
  reasoningEffort: boolean
  instructionsField: boolean
  structuredToolCalls: boolean
  toolChoice: 'none' | 'auto'
  toolCallMode: CodexToolCallMode
  explicitPermissionEvents: boolean
}

const CODEX_PROVIDER_PROFILE: CodexProviderProfile = {
  provider: 'custom',
  turnAdapter: 'responses-api',
  reasoningEffort: true,
  // Our current Codex relay emits natural assistant preambles much more
  // reliably when the main prompt is sent as a developer message rather than
  // the Responses `instructions` field.
  instructionsField: false,
  structuredToolCalls: true,
  toolChoice: 'auto',
  toolCallMode: 'structured-function-call-with-text-fallback',
  explicitPermissionEvents: true,
}

export function getCodexProviderProfile(): CodexProviderProfile {
  return CODEX_PROVIDER_PROFILE
}

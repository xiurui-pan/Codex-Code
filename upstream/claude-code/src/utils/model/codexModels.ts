import type { EffortLevel } from 'src/entrypoints/sdk/runtimeTypes.js'


export type CodexPublicModelInfo = {
  value: string
  displayName: string
  description: string
  defaultEffortLevel: EffortLevel
  supportedEffortLevels: readonly EffortLevel[]
}

export type CodexModelCapability = {
  value: string
  displayName: string
  description: string
  defaultEffort: EffortLevel
  supportedEffortLevels: readonly EffortLevel[]
  aliases?: readonly string[]
}

export const DEFAULT_CODEX_MODEL = 'gpt-5.4'
export const DEFAULT_CODEX_REASONING_EFFORT: EffortLevel = 'medium'

const CODEX_MODEL_CAPABILITIES = [
  {
    value: 'gpt-5.4-mini',
    displayName: 'gpt-5.4-mini',
    description: 'Fast Codex model for routine coding work.',
    defaultEffort: 'medium',
    supportedEffortLevels: ['low', 'medium', 'high', 'xhigh'],
    aliases: ['mini', 'haiku'],
  },
  {
    value: 'gpt-5.4',
    displayName: 'gpt-5.4',
    description: 'Latest frontier agentic coding model.',
    defaultEffort: 'medium',
    supportedEffortLevels: ['low', 'medium', 'high', 'xhigh'],
    aliases: ['codex', 'sonnet'],
  },
  {
    value: 'gpt-5.3-codex',
    displayName: 'gpt-5.3-codex',
    description: 'Frontier agentic coding model.',
    defaultEffort: 'medium',
    supportedEffortLevels: ['low', 'medium', 'high', 'xhigh'],
    aliases: ['best', 'max', 'opus', 'opusplan'],
  },
  {
    value: 'gpt-5.2-codex',
    displayName: 'gpt-5.2-codex',
    description: 'Latest general-purpose Codex model.',
    defaultEffort: 'medium',
    supportedEffortLevels: ['low', 'medium', 'high', 'xhigh'],
  },
  {
    value: 'gpt-5.1-codex-mini',
    displayName: 'gpt-5.1-codex-mini',
    description: 'Legacy fast Codex model.',
    defaultEffort: 'medium',
    supportedEffortLevels: ['medium', 'high'],
  },
  {
    value: 'gpt-5.1-codex',
    displayName: 'gpt-5.1-codex',
    description: 'Legacy balanced Codex model.',
    defaultEffort: 'medium',
    supportedEffortLevels: ['low', 'medium', 'high'],
  },
  {
    value: 'gpt-5.1-codex-max',
    displayName: 'gpt-5.1-codex-max',
    description: 'Legacy deepest-reasoning Codex model.',
    defaultEffort: 'medium',
    supportedEffortLevels: ['low', 'medium', 'high', 'xhigh'],
  },
] as const satisfies readonly CodexModelCapability[]

const CODEX_MODEL_ALIAS_MAP = new Map<string, string>()
for (const capability of CODEX_MODEL_CAPABILITIES) {
  CODEX_MODEL_ALIAS_MAP.set(capability.value.toLowerCase(), capability.value)
  for (const alias of capability.aliases ?? []) {
    CODEX_MODEL_ALIAS_MAP.set(alias.toLowerCase(), capability.value)
  }
}

export function getCodexModelCapabilities(): readonly CodexModelCapability[] {
  return CODEX_MODEL_CAPABILITIES
}

export function resolveCodexModelInput(model: string): string {
  const normalized = model.trim().toLowerCase()
  return CODEX_MODEL_ALIAS_MAP.get(normalized) ?? model.trim()
}

export function findCodexModelCapability(
  model: string | null | undefined,
): CodexModelCapability | undefined {
  if (!model) {
    return undefined
  }

  const resolved = resolveCodexModelInput(model)
  return CODEX_MODEL_CAPABILITIES.find(
    capability => capability.value.toLowerCase() === resolved.toLowerCase(),
  )
}

export function getCodexDefaultEffortForModel(
  model: string | null | undefined,
): EffortLevel {
  return findCodexModelCapability(model)?.defaultEffort ?? DEFAULT_CODEX_REASONING_EFFORT
}

export function getCodexSupportedEffortLevels(
  model: string | null | undefined,
): readonly EffortLevel[] {
  return (
    findCodexModelCapability(model)?.supportedEffortLevels ??
    [DEFAULT_CODEX_REASONING_EFFORT]
  )
}

export function codexModelSupportsEffort(model: string | null | undefined): boolean {
  return getCodexSupportedEffortLevels(model).length > 0
}

export function codexModelSupportsMaxEffort(
  model: string | null | undefined,
): boolean {
  return (
    getCodexSupportedEffortLevels(model).includes('xhigh') ||
    getCodexSupportedEffortLevels(model).includes('max')
  )
}


export function createCodexPublicModelInfo(params: {
  value: string
  displayName?: string
  description?: string
  publicValue?: string
}): CodexPublicModelInfo {
  const resolvedModel = resolveCodexModelInput(params.value)
  return {
    value: params.publicValue ?? resolvedModel,
    displayName: params.displayName ?? resolvedModel,
    description: params.description ?? 'Custom Codex model',
    defaultEffortLevel: getCodexDefaultEffortForModel(resolvedModel),
    supportedEffortLevels: [...getCodexSupportedEffortLevels(resolvedModel)],
  }
}

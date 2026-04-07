import { getGlobalConfig } from '../config.js'
import { getCodexConfiguredModel } from '../codexConfig.js'
import {
  CODEX_PLAN_MODE_ALIAS,
  DEFAULT_CODEX_MODEL,
  createCodexPublicModelInfo,
  getCodexModelCapabilities,
  isCodexPlanModeAlias,
  resolveCodexModelInput,
  type CodexPublicModelInfo,
} from './codexModels.js'
import {
  getDefaultMainLoopModelSetting,
  renderDefaultModelSetting,
  type ModelSetting,
} from './model.js'

export type ModelOption = {
  value: ModelSetting
  label: string
  description: string
  descriptionForModel?: string
}

export function getDefaultOptionForUser(): ModelOption {
  return {
    value: null,
    label: 'Default (recommended)',
    description: `Use the default Codex model (currently ${renderDefaultModelSetting(getDefaultMainLoopModelSetting())})`,
    descriptionForModel: `Default model (currently ${renderDefaultModelSetting(getDefaultMainLoopModelSetting())})`,
  }
}

function createKnownModelOption(model: string): ModelOption {
  if (isCodexPlanModeAlias(model)) {
    return {
      value: CODEX_PLAN_MODE_ALIAS,
      label: 'XhighPlan',
      description: 'Keep gpt-5.4 and switch reasoning between medium and xhigh based on plan mode.',
      descriptionForModel:
        'XhighPlan (gpt-5.4, medium by default, xhigh in plan mode)',
    }
  }

  const normalizedModel = resolveCodexModelInput(model)
  const capability = getCodexModelCapabilities().find(
    item => item.value === normalizedModel,
  )

  if (!capability) {
    return {
      value: normalizedModel,
      label: normalizedModel,
      description: 'Custom Codex model',
      descriptionForModel: `Custom Codex model (${normalizedModel})`,
    }
  }

  return {
    value: capability.value,
    label: capability.displayName,
    description: capability.description,
    descriptionForModel: capability.description,
  }
}

function appendUniqueModelOption(options: ModelOption[], option: ModelOption): void {
  if (options.some(existing => existing.value === option.value)) {
    return
  }
  options.push(option)
}

export function getModelOptions(params?: {
  extraModels?: Array<ModelSetting | undefined>
}): ModelOption[] {
  const options: ModelOption[] = [
    getDefaultOptionForUser(),
    createKnownModelOption(CODEX_PLAN_MODE_ALIAS),
    ...getCodexModelCapabilities().map(capability => ({
      value: capability.value,
      label: capability.displayName,
      description: capability.description,
      descriptionForModel: capability.description,
    })),
  ]

  const additional = getGlobalConfig().additionalModelOptionsCache ?? []
  for (const option of additional) {
    const normalized =
      option.value === null
        ? null
        : isCodexPlanModeAlias(String(option.value))
          ? CODEX_PLAN_MODE_ALIAS
          : resolveCodexModelInput(String(option.value))
    if (normalized === null) {
      continue
    }
    appendUniqueModelOption(options, {
      ...option,
      value: normalized,
    })
  }

  const extraModels = [
    getCodexConfiguredModel(),
    DEFAULT_CODEX_MODEL,
    ...(params?.extraModels ?? []),
  ]
  for (const model of extraModels) {
    if (!model) {
      continue
    }
    appendUniqueModelOption(options, createKnownModelOption(String(model)))
  }

  return options
}

export function findSelectableModelOption(
  modelInput: string,
  params?: { extraModels?: Array<ModelSetting | undefined> },
): ModelOption | undefined {
  const normalized = isCodexPlanModeAlias(modelInput)
    ? CODEX_PLAN_MODE_ALIAS
    : resolveCodexModelInput(modelInput)
  return getModelOptions(params).find(option => option.value === normalized)
}

export function getModelCommandChoices(
  params?: { extraModels?: Array<ModelSetting | undefined> },
): string[] {
  return getModelOptions(params)
    .map(option => option.value)
    .filter((value): value is string => value !== null)
}

export function getPublicModelInfoForOption(option: ModelOption): CodexPublicModelInfo {
  if (option.value === null) {
    return createCodexPublicModelInfo({
      value: DEFAULT_CODEX_MODEL,
      publicValue: 'default',
      displayName: option.label,
      description: option.description,
    })
  }

  return createCodexPublicModelInfo({
    value: option.value,
    displayName: option.label,
    description: option.description,
  })
}

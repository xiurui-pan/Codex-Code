import { getGlobalConfig } from '../config.js'
import {
  DEFAULT_CODEX_MODEL,
  getCodexModelCapabilities,
  resolveCodexModelInput,
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
  const capability = getCodexModelCapabilities().find(
    item => item.value === resolveCodexModelInput(model),
  )

  if (!capability) {
    return {
      value: model,
      label: model,
      description: 'Custom Codex model',
      descriptionForModel: `Custom Codex model (${model})`,
    }
  }

  return {
    value: capability.value,
    label: capability.displayName,
    description: capability.description,
    descriptionForModel: capability.description,
  }
}

export function getModelOptions(_fastMode = false): ModelOption[] {
  const options: ModelOption[] = [
    getDefaultOptionForUser(),
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
      option.value === null ? null : resolveCodexModelInput(String(option.value))
    if (
      normalized !== null &&
      !options.some(existing => existing.value === normalized)
    ) {
      options.push({
        ...option,
        value: normalized,
      })
    }
  }

  const configuredDefault = resolveCodexModelInput(DEFAULT_CODEX_MODEL)
  if (!options.some(option => option.value === configuredDefault)) {
    options.push(createKnownModelOption(configuredDefault))
  }

  return options
}

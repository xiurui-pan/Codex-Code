// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { isUltrathinkEnabled } from './thinking.js'
import { getInitialSettings } from './settings/settings.js'
import { createRequire } from 'node:module'
import { getAPIProvider } from './model/providers.js'
import { get3PModelCapabilityOverride } from './model/modelSupportOverrides.js'
import { isEnvTruthy } from './envUtils.js'
import { isCurrentPhaseCustomCodexProvider } from './currentPhase.js'
import {
  codexModelSupportsEffort,
  codexModelSupportsMaxEffort,
  getCodexDefaultEffortForModel,
  getCodexSupportedEffortLevels,
  isCodexPlanModeAlias,
} from './model/codexModels.js'
import { getUserSpecifiedModelSetting } from './model/model.js'
import type { EffortLevel } from 'src/entrypoints/sdk/runtimeTypes.js'
import type { PermissionMode } from './permissions/PermissionMode.js'

const require = createRequire(import.meta.url)
const currentPhaseDisableLegacyEffortGates = process.env.CODEX_CODE_USE_CODEX_PROVIDER === '1'

function getAuthModule() {
  return require('./auth.js') as typeof import('./auth.js')
}

function isProSubscriber() {
  return currentPhaseDisableLegacyEffortGates ? false : getAuthModule().isProSubscriber()
}

function isMaxSubscriber() {
  return currentPhaseDisableLegacyEffortGates ? false : getAuthModule().isMaxSubscriber()
}

function isTeamSubscriber() {
  return currentPhaseDisableLegacyEffortGates ? false : getAuthModule().isTeamSubscriber()
}

function getFeatureValue_CACHED_MAY_BE_STALE<T>(feature: string, fallback: T): T {
  if (currentPhaseDisableLegacyEffortGates) return fallback
  return (require('src/services/analytics/growthbook.js') as typeof import('src/services/analytics/growthbook.js')).getFeatureValue_CACHED_MAY_BE_STALE(feature, fallback)
}

export type { EffortLevel }

export const EFFORT_LEVELS = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const satisfies readonly EffortLevel[]

export type EffortValue = EffortLevel | number

// @[MODEL LAUNCH]: Add the new model to the allowlist if it supports the effort parameter.
export function modelSupportsEffort(model: string): boolean {
  if (isCurrentPhaseCustomCodexProvider()) {
    return codexModelSupportsEffort(model)
  }

  const m = model.toLowerCase()
  if (isEnvTruthy(process.env.CODEX_CODE_ALWAYS_ENABLE_EFFORT)) {
    return true
  }
  const supported3P = get3PModelCapabilityOverride(model, 'effort')
  if (supported3P !== undefined) {
    return supported3P
  }
  // Supported by a subset of Claude 4 models
  if (m.includes('opus-4-6') || m.includes('sonnet-4-6')) {
    return true
  }
  // Exclude any other known legacy models (haiku, older opus/sonnet variants)
  if (m.includes('haiku') || m.includes('sonnet') || m.includes('opus')) {
    return false
  }

  // IMPORTANT: Do not change the default effort support without notifying
  // the model launch DRI and research. This is a sensitive setting that can
  // greatly affect model quality and bashing.

  // Default to true for unknown model strings on 1P.
  // Do not default to true for 3P as they have different formats for their
  // model strings (ex. anthropics/claude-code#30795)
  return getAPIProvider() === 'firstParty'
}

// @[MODEL LAUNCH]: Add the new model to the allowlist if it supports 'max' effort.
// Per API docs, 'max' is Opus 4.6 only for public models — other models return an error.
export function modelSupportsMaxEffort(model: string): boolean {
  if (isCurrentPhaseCustomCodexProvider()) {
    return codexModelSupportsMaxEffort(model)
  }

  const supported3P = get3PModelCapabilityOverride(model, 'max_effort')
  if (supported3P !== undefined) {
    return supported3P
  }
  if (model.toLowerCase().includes('opus-4-6')) {
    return true
  }
  if (process.env.USER_TYPE === 'ant' && resolveAntModel(model)) {
    return true
  }
  return false
}

export function isEffortLevel(value: string): value is EffortLevel {
  return (EFFORT_LEVELS as readonly string[]).includes(value)
}

export function parseEffortValue(value: unknown): EffortValue | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  if (typeof value === 'number' && isValidNumericEffort(value)) {
    return value
  }
  const str = String(value).toLowerCase()
  if (isEffortLevel(str)) {
    return str
  }
  const numericValue = parseInt(str, 10)
  if (!isNaN(numericValue) && isValidNumericEffort(numericValue)) {
    return numericValue
  }
  return undefined
}

/**
 * Numeric values are model-default only and not persisted.
 * 'max' is session-scoped for external users (ants can persist it).
 * Write sites call this before saving to settings so the Zod schema
 * (which only accepts string levels) never rejects a write.
 */
export function toPersistableEffort(
  value: EffortValue | undefined,
): EffortLevel | undefined {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value
  }
  if (value === 'xhigh') {
    return value
  }
  if (value === 'max' && process.env.USER_TYPE === 'ant') {
    return value
  }
  return undefined
}

export function getInitialEffortSetting(): EffortLevel | undefined {
  // toPersistableEffort filters 'max' for non-ants on read, so a manually
  // edited settings.json doesn't leak session-scoped max into a fresh session.
  return toPersistableEffort(getInitialSettings().effortLevel)
}

/**
 * Decide what effort level (if any) to persist when the user selects a model
 * in ModelPicker. Keeps an explicit prior /effort choice sticky even when it
 * matches the picked model's default, while letting purely-default and
 * session-ephemeral effort (CLI --effort, EffortCallout default) fall through
 * to undefined so it follows future model-default changes.
 *
 * priorPersisted must come from userSettings on disk
 * (getSettingsForSource('userSettings')?.effortLevel), NOT merged settings
 * (project/policy layers would leak into the user's global settings.json)
 * and NOT AppState.effortValue (includes session-scoped sources that
 * deliberately do not write to settings.json).
 */
export function resolvePickerEffortPersistence(
  picked: EffortLevel | undefined,
  modelDefault: EffortLevel,
  priorPersisted: EffortLevel | undefined,
  toggledInPicker: boolean,
  supportsTargetModel: boolean,
): EffortLevel | undefined {
  if (!supportsTargetModel) {
    return undefined
  }

  if (toggledInPicker) {
    return picked
  }

  if (picked !== undefined) {
    return priorPersisted !== undefined || picked !== modelDefault
      ? picked
      : undefined
  }

  return priorPersisted
}

export function getEffortEnvOverride(): EffortValue | null | undefined {
  const envOverride = process.env.CODEX_CODE_EFFORT_LEVEL
  return envOverride?.toLowerCase() === 'unset' ||
    envOverride?.toLowerCase() === 'auto'
    ? null
    : parseEffortValue(envOverride)
}

export type EffortApplicationState = {
  requested: EffortValue | undefined
  applied: EffortValue | undefined
  envOverride: EffortValue | null | undefined
  configDefault: EffortValue | undefined
  modelDefault: EffortValue | undefined
  source: 'plan_mode' | 'env' | 'session' | 'config' | 'model'
  isEnvOverridden: boolean
}

export function getConfiguredDefaultEffort(): EffortValue | undefined {
  return parseEffortValue(process.env.CODEX_CODE_DEFAULT_REASONING_EFFORT)
}

export function getEffortApplicationState(
  model: string,
  requestedEffortValue: EffortValue | undefined,
  permissionMode?: PermissionMode,
): EffortApplicationState {
  const envOverride = getEffortEnvOverride()
  const configDefault = getConfiguredDefaultEffort()
  const modelDefault = getDefaultEffortForModel(model)
  const planModeOverride = getCodexPlanModeEffortOverride(model, permissionMode)
  const applied = resolveAppliedEffort(model, requestedEffortValue, permissionMode)
  const source =
    planModeOverride !== undefined
      ? 'plan_mode'
      : envOverride !== undefined
      ? 'env'
      : requestedEffortValue !== undefined
        ? 'session'
        : configDefault !== undefined
          ? 'config'
          : 'model'
  return {
    requested: requestedEffortValue,
    applied,
    envOverride,
    configDefault,
    modelDefault,
    source,
    isEnvOverridden:
      envOverride !== undefined && envOverride !== requestedEffortValue,
  }
}

export function formatEffortOverrideMessage(
  effortValue: Exclude<EffortValue, 'max'>,
  options?: { persistable?: boolean },
): string | null {
  const envOverride = getEffortEnvOverride()
  if (envOverride === undefined || envOverride === effortValue) {
    return null
  }

  const envRaw = process.env.CODEX_CODE_EFFORT_LEVEL
  if (options?.persistable === false) {
    return `Not applied: CODEX_CODE_EFFORT_LEVEL=${envRaw} overrides effort this session, and ${effortValue} is session-only (nothing saved)`
  }

  return `CODEX_CODE_EFFORT_LEVEL=${envRaw} overrides this session — clear it and ${effortValue} takes over`
}

/**
 * Resolve the effort value that will actually be sent to the API for a given
 * model, following the full precedence chain:
 *   XhighPlan mode → env CODEX_CODE_EFFORT_LEVEL → appState.effortValue
 *   → config default → model default
 *
 * Returns undefined when no effort parameter should be sent (env set to
 * 'unset', or no default exists for the model).
 */
export function resolveAppliedEffort(
  model: string,
  appStateEffortValue: EffortValue | undefined,
  permissionMode?: PermissionMode,
): EffortValue | undefined {
  const planModeOverride = getCodexPlanModeEffortOverride(model, permissionMode)
  if (planModeOverride !== undefined) {
    return planModeOverride
  }

  const envOverride = getEffortEnvOverride()
  if (envOverride === null) {
    return undefined
  }
  const configDefault = getConfiguredDefaultEffort()
  const resolved =
    envOverride ?? appStateEffortValue ?? configDefault ?? getDefaultEffortForModel(model)
  // API rejects 'max' on non-Opus-4.6 models — downgrade to 'high'.
  if (resolved === 'max' && !modelSupportsMaxEffort(model)) {
    return 'high'
  }
  return resolved
}

/**
 * Resolve the effort level to show the user. Wraps resolveAppliedEffort
 * with the 'high' fallback (what the API uses when no effort param is sent).
 * Single source of truth for the status bar and /effort output (CC-1088).
 */
export function getDisplayedEffortLevel(
  model: string,
  appStateEffort: EffortValue | undefined,
  permissionMode?: PermissionMode,
): EffortLevel {
  const resolved = resolveAppliedEffort(model, appStateEffort, permissionMode) ?? 'high'
  return convertEffortValueToLevel(resolved)
}

/**
 * Build the ` with {level} effort` suffix shown in Logo/Spinner.
 * Returns empty string if the user hasn't explicitly set an effort value.
 * Delegates to resolveAppliedEffort() so the displayed level matches what
 * the API actually receives (including max→high clamp for non-Opus models).
 */
export function getEffortSuffix(
  model: string,
  effortValue: EffortValue | undefined,
  permissionMode?: PermissionMode,
): string {
  if (effortValue === undefined) return ''
  const resolved = resolveAppliedEffort(model, effortValue, permissionMode)
  if (resolved === undefined) return ''
  return ` with ${convertEffortValueToLevel(resolved)} effort`
}

export function getUltrathinkEffortLevel(
  model: string,
): EffortLevel | undefined {
  if (isCurrentPhaseCustomCodexProvider()) {
    const supportedLevels = getCodexSupportedEffortLevels(model)
    if (supportedLevels.includes('xhigh')) {
      return 'xhigh'
    }
    if (supportedLevels.includes('high')) {
      return 'high'
    }
    if (supportedLevels.includes('medium')) {
      return 'medium'
    }
    if (supportedLevels.includes('low')) {
      return 'low'
    }
    return undefined
  }

  return modelSupportsEffort(model) ? 'high' : undefined
}

function getCodexPlanModeEffortOverride(
  model: string,
  permissionMode: PermissionMode | undefined,
): EffortLevel | undefined {
  if (!isCurrentPhaseCustomCodexProvider()) {
    return undefined
  }

  if (!isCodexPlanModeAlias(getUserSpecifiedModelSetting())) {
    return undefined
  }

  const supportedLevels = getCodexSupportedEffortLevels(model)
  if (permissionMode === 'plan') {
    return supportedLevels.includes('xhigh') ? 'xhigh' : undefined
  }

  return supportedLevels.includes('medium') ? 'medium' : undefined
}

export function isValidNumericEffort(value: number): boolean {
  return Number.isInteger(value)
}

export function convertEffortValueToLevel(value: EffortValue): EffortLevel {
  if (typeof value === 'string') {
    // Runtime guard: value may come from remote config (GrowthBook) where
    // TypeScript types can't help us. Coerce unknown strings to 'high'
    // rather than passing them through unchecked.
    return isEffortLevel(value) ? value : 'high'
  }
  if (process.env.USER_TYPE === 'ant' && typeof value === 'number') {
    if (value <= 50) return 'low'
    if (value <= 85) return 'medium'
    if (value <= 100) return 'high'
    return 'xhigh'
  }
  return 'high'
}

/**
 * Get user-facing description for effort levels
 *
 * @param level The effort level to describe
 * @returns Human-readable description
 */
export function getEffortLevelDescription(level: EffortLevel): string {
  switch (level) {
    case 'low':
      return 'Lower reasoning for quick responses'
    case 'medium':
      return 'Balanced reasoning for everyday coding work'
    case 'high':
      return 'Stronger reasoning for harder tasks'
    case 'xhigh':
      return 'Extra-high reasoning for the hardest tasks'
    case 'max':
      return 'Deepest reasoning on the highest-capability Codex model'
  }
}

/**
 * Get user-facing description for effort values (both string and numeric)
 *
 * @param value The effort value to describe
 * @returns Human-readable description
 */
export function getEffortValueDescription(value: EffortValue): string {
  if (process.env.USER_TYPE === 'ant' && typeof value === 'number') {
    return `[ANT-ONLY] Numeric effort value of ${value}`
  }

  if (typeof value === 'string') {
    return getEffortLevelDescription(value)
  }
  return 'Balanced approach with standard implementation and testing'
}

export type OpusDefaultEffortConfig = {
  enabled: boolean
  dialogTitle: string
  dialogDescription: string
}

const OPUS_DEFAULT_EFFORT_CONFIG_DEFAULT: OpusDefaultEffortConfig = {
  enabled: true,
  dialogTitle: 'We recommend medium effort for Opus',
  dialogDescription:
    'Effort determines how long Claude thinks for when completing your task. We recommend medium effort for most tasks to balance speed and intelligence and maximize rate limits. Use ultrathink to trigger high effort when needed.',
}

export function getOpusDefaultEffortConfig(): OpusDefaultEffortConfig {
  const config = getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_grey_step2',
    OPUS_DEFAULT_EFFORT_CONFIG_DEFAULT,
  )
  return {
    ...OPUS_DEFAULT_EFFORT_CONFIG_DEFAULT,
    ...config,
  }
}

// @[MODEL LAUNCH]: Update the default effort levels for new models
export function getDefaultEffortForModel(
  model: string,
): EffortValue | undefined {
  if (isCurrentPhaseCustomCodexProvider()) {
    return getCodexDefaultEffortForModel(model)
  }

  if (process.env.USER_TYPE === 'ant') {
    const config = getAntModelOverrideConfig()
    const isDefaultModel =
      config?.defaultModel !== undefined &&
      model.toLowerCase() === config.defaultModel.toLowerCase()
    if (isDefaultModel && config?.defaultModelEffortLevel) {
      return config.defaultModelEffortLevel
    }
    const antModel = resolveAntModel(model)
    if (antModel) {
      if (antModel.defaultEffortLevel) {
        return antModel.defaultEffortLevel
      }
      if (antModel.defaultEffortValue !== undefined) {
        return antModel.defaultEffortValue
      }
    }
    // Always default ants to undefined/high
    return undefined
  }

  // IMPORTANT: Do not change the default effort level without notifying
  // the model launch DRI and research. Default effort is a sensitive setting
  // that can greatly affect model quality and bashing.

  // Default effort on Opus 4.6 to medium for Pro.
  // Max/Team also get medium when the tengu_grey_step2 config is enabled.
  if (model.toLowerCase().includes('opus-4-6')) {
    if (isProSubscriber()) {
      return 'medium'
    }
    if (
      getOpusDefaultEffortConfig().enabled &&
      (isMaxSubscriber() || isTeamSubscriber())
    ) {
      return 'medium'
    }
  }

  // When ultrathink feature is on, default effort to medium (ultrathink bumps to high)
  if (isUltrathinkEnabled() && modelSupportsEffort(model)) {
    return 'medium'
  }

  // Fallback to undefined, which means we don't set an effort level. This
  // should resolve to high effort level in the API.
  return undefined
}

import * as React from 'react'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import {
  formatEffortOverrideMessage,
  type EffortValue,
  getEffortApplicationState,
  getEffortValueDescription,
  isEffortLevel,
  toPersistableEffort,
} from '../../utils/effort.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'

const COMMON_HELP_ARGS = ['help', '-h', '--help']

type EffortCommandResult = {
  message: string
  effortUpdate?: {
    value: EffortValue | undefined
  }
}

function formatResolvedEffortStatus(
  appStateEffort: EffortValue | undefined,
  model: string,
): string {
  const state = getEffortApplicationState(model, appStateEffort)
  const applied = state.applied

  if (state.source === 'env') {
    if (state.envOverride === null) {
      return 'Effort level: auto (forced by CODEX_CODE_EFFORT_LEVEL=auto)'
    }

    return `Current effort level: ${applied} (${getEffortValueDescription(applied!)}; source: env override)`
  }

  if (state.source === 'session' && appStateEffort !== undefined) {
    return `Current effort level: ${appStateEffort} (${getEffortValueDescription(appStateEffort)}; source: session override)`
  }

  if (state.source === 'config' && applied !== undefined) {
    return `Effort level: auto (currently ${applied} from config default)`
  }

  if (applied !== undefined) {
    return `Effort level: auto (currently ${applied} from model default)`
  }

  return 'Effort level: auto'
}

function setEffortValue(effortValue: EffortValue): EffortCommandResult {
  const persistable = toPersistableEffort(effortValue)
  if (persistable !== undefined) {
    const result = updateSettingsForSource('userSettings', {
      effortLevel: persistable,
    })
    if (result.error) {
      return {
        message: `Failed to set effort level: ${result.error.message}`,
      }
    }
  }
  logEvent('tengu_effort_command', {
    effort:
      effortValue as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  const overrideMessage = formatEffortOverrideMessage(effortValue, {
    persistable: persistable !== undefined,
  })
  if (overrideMessage) {
    return {
      message: overrideMessage,
      effortUpdate: {
        value: effortValue,
      },
    }
  }
  const description = getEffortValueDescription(effortValue)
  const suffix = persistable !== undefined ? '' : ' (this session only)'
  return {
    message: `Set effort level to ${effortValue}${suffix}: ${description}`,
    effortUpdate: {
      value: effortValue,
    },
  }
}

export function showCurrentEffort(
  appStateEffort: EffortValue | undefined,
  model: string,
): EffortCommandResult {
  return {
    message: formatResolvedEffortStatus(appStateEffort, model),
  }
}

function unsetEffortLevel(): EffortCommandResult {
  const result = updateSettingsForSource('userSettings', {
    effortLevel: undefined,
  })
  if (result.error) {
    return {
      message: `Failed to set effort level: ${result.error.message}`,
    }
  }
  logEvent('tengu_effort_command', {
    effort:
      'auto' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
  const state = getEffortApplicationState('gpt-5.4', undefined)
  if (state.source === 'env' && state.envOverride !== null) {
    const envRaw = process.env.CODEX_CODE_EFFORT_LEVEL
    return {
      message: `Cleared effort from settings, but CODEX_CODE_EFFORT_LEVEL=${envRaw} still controls this session`,
      effortUpdate: {
        value: undefined,
      },
    }
  }
  return {
    message: 'Effort level set to auto',
    effortUpdate: {
      value: undefined,
    },
  }
}

export function executeEffort(args: string): EffortCommandResult {
  const normalized = args.toLowerCase()
  if (normalized === 'auto' || normalized === 'unset') {
    return unsetEffortLevel()
  }

  if (!isEffortLevel(normalized) || normalized === 'max') {
    return {
      message: `Invalid argument: ${args}. Valid options are: low, medium, high, xhigh, auto`,
    }
  }

  return setEffortValue(normalized)
}

function ShowCurrentEffort({
  onDone,
}: {
  onDone: (result: string) => void
}): React.ReactNode {
  const effortValue = useAppState(s => s.effortValue)
  const model = useMainLoopModel()
  const { message } = showCurrentEffort(effortValue, model)
  onDone(message)
  return null
}

function ApplyEffortAndClose({
  result,
  onDone,
}: {
  result: EffortCommandResult
  onDone: (result: string) => void
}): React.ReactNode {
  const setAppState = useSetAppState()
  const { effortUpdate, message } = result
  React.useEffect(() => {
    if (effortUpdate) {
      setAppState(prev => ({
        ...prev,
        effortValue: effortUpdate.value,
      }))
    }
    onDone(message)
  }, [setAppState, effortUpdate, message, onDone])
  return null
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: unknown,
  args?: string,
): Promise<React.ReactNode> {
  args = args?.trim() || ''

  if (COMMON_HELP_ARGS.includes(args)) {
    onDone(
      'Usage: /effort [low|medium|high|xhigh|auto]\n\nReasoning levels:\n- low: Lower reasoning for quick responses\n- medium: Balanced reasoning for everyday coding work\n- high: Stronger reasoning for harder tasks\n- xhigh: Extra-high reasoning for the hardest tasks\n- auto: Use the effective default reasoning level for your current model (session override cleared; config default and then model default still apply)',
    )
    return
  }

  if (!args || args === 'current' || args === 'status') {
    return <ShowCurrentEffort onDone={onDone} />
  }

  const result = executeEffort(args)
  return <ApplyEffortAndClose result={result} onDone={onDone} />
}

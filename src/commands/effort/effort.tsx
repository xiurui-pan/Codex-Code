import * as React from 'react'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import type { PermissionMode } from '../../utils/permissions/PermissionMode.js'
import {
  formatEffortOverrideMessage,
  type EffortValue,
  getEffortApplicationState,
  getEffortValueDescription,
  isEffortLevel,
} from '../../utils/effort.js'

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
  permissionMode?: PermissionMode,
): string {
  const state = getEffortApplicationState(model, appStateEffort, permissionMode)
  const applied = state.applied

  if (state.source === 'plan_mode' && applied !== undefined) {
    return `Current effort level: ${applied} (${getEffortValueDescription(applied)}; source: XhighPlan)`
  }

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
  logEvent('tengu_effort_command', {
    effort:
      effortValue as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  const overrideMessage = formatEffortOverrideMessage(effortValue, {
    persistable: false,
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
  return {
    message: `Set effort level to ${effortValue} (this session only): ${description}`,
    effortUpdate: {
      value: effortValue,
    },
  }
}

export function showCurrentEffort(
  appStateEffort: EffortValue | undefined,
  model: string,
  permissionMode?: PermissionMode,
): EffortCommandResult {
  return {
    message: formatResolvedEffortStatus(appStateEffort, model, permissionMode),
  }
}

function unsetEffortLevel(): EffortCommandResult {
  logEvent('tengu_effort_command', {
    effort:
      'auto' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
  const state = getEffortApplicationState('gpt-5.4', undefined)
  if (state.source === 'env' && state.envOverride !== null) {
    const envRaw = process.env.CODEX_CODE_EFFORT_LEVEL
    return {
      message: `Cleared session effort override, but CODEX_CODE_EFFORT_LEVEL=${envRaw} still controls this session`,
      effortUpdate: {
        value: undefined,
      },
    }
  }
  return {
    message: 'Effort level set to auto for this session',
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
  const permissionMode = useAppState(s => s.toolPermissionContext.mode)
  const { message } = showCurrentEffort(effortValue, model, permissionMode)
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
      'Usage: /effort [low|medium|high|xhigh|auto]\n\nReasoning levels:\n- low: Lower reasoning for quick responses\n- medium: Balanced reasoning for everyday coding work\n- high: Stronger reasoning for harder tasks\n- xhigh: Extra-high reasoning for the hardest tasks\n- auto: Clear this session\'s override and use the effective default reasoning level for your current model',
    )
    return
  }

  if (!args || args === 'current' || args === 'status') {
    return <ShowCurrentEffort onDone={onDone} />
  }

  const result = executeEffort(args)
  return <ApplyEffortAndClose result={result} onDone={onDone} />
}

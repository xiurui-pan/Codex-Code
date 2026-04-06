import * as React from 'react'
import { useEffect } from 'react'
import { ModelPicker } from '../../components/ModelPicker.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import type {
  CommandResultDisplay,
  LocalJSXCommandCall,
} from '../../types/command.js'
import {
  getEffortApplicationState,
  type EffortLevel,
} from '../../utils/effort.js'
import {
  getDefaultMainLoopModel,
  modelDisplayString,
} from '../../utils/model/model.js'
import {
  findSelectableModelOption,
  getModelCommandChoices,
} from '../../utils/model/modelOptions.js'

const COMMON_HELP_ARGS = ['help', '-h', '--help']
const COMMON_INFO_ARGS = ['current', 'status']

type OnDone = (
  result?: string,
  options?: { display?: CommandResultDisplay },
) => void

function ModelPickerWrapper({
  onDone,
}: {
  onDone: OnDone
}): React.ReactNode {
  const mainLoopModel = useAppState(state => state.mainLoopModel)
  const mainLoopModelForSession = useAppState(state => state.mainLoopModelForSession)
  const effortValue = useAppState(state => state.effortValue)
  const setAppState = useSetAppState()

  function handleSelect(model: string | null, effort: EffortLevel | undefined): void {
    setAppState(prev => ({
      ...prev,
      mainLoopModel: model,
      mainLoopModelForSession: null,
      ...(effort !== undefined && { effortValue: effort }),
    }))

    const appliedModel = model ?? mainLoopModel ?? mainLoopModelForSession
    const effortState =
      effort !== undefined && appliedModel
        ? getEffortApplicationState(appliedModel, effort)
        : null
    const effortSuffix = effort !== undefined ? ` with ${effort} reasoning` : ''
    const baseMessage = `Set model to ${modelDisplayString(model)}${effortSuffix}`

    if (effortState?.source === 'env' && effortState.isEnvOverridden && effortState.applied !== effort) {
      const envRaw = process.env.CODEX_CODE_EFFORT_LEVEL
      onDone(
        `${baseMessage}. CODEX_CODE_EFFORT_LEVEL=${envRaw} still controls this session — current effort stays ${effortState.applied}`,
      )
      return
    }

    onDone(baseMessage)
  }

  function handleCancel(): void {
    const appliedEffort = getEffortApplicationState(
      mainLoopModel ?? getDefaultMainLoopModel(),
      effortValue,
    ).applied
    const effortSuffix =
      appliedEffort !== undefined ? ` (reasoning: ${appliedEffort})` : ''
    onDone(`Kept model as ${modelDisplayString(mainLoopModel)}${effortSuffix}`, {
      display: 'system',
    })
  }

  return (
    <ModelPicker
      initial={mainLoopModel}
      sessionModel={mainLoopModelForSession}
      onSelect={handleSelect}
      onCancel={handleCancel}
      isStandaloneCommand
    />
  )
}

function SetModelAndClose({
  args,
  onDone,
}: {
  args: string
  onDone: OnDone
}): React.ReactNode {
  const setAppState = useSetAppState()
  const mainLoopModel = useAppState(state => state.mainLoopModel)

  useEffect(() => {
    const rawInput = args.trim()
    const normalized = rawInput.toLowerCase()

    if (normalized === 'default') {
      setAppState(prev => ({
        ...prev,
        mainLoopModel: null,
        mainLoopModelForSession: null,
      }))
      onDone('Reset model to the Codex default.', { display: 'system' })
      return
    }

    const option = findSelectableModelOption(rawInput, {
      extraModels: [mainLoopModel],
    })
    if (!option || option.value === null) {
      onDone(
        `Unknown model '${rawInput}'. Use /model to pick one of ${getModelCommandChoices({ extraModels: [mainLoopModel] }).join(', ')}, or pass default.`,
        { display: 'system' },
      )
      return
    }

    setAppState(prev => ({
      ...prev,
      mainLoopModel: option.value,
      mainLoopModelForSession: null,
    }))
    onDone(`Set model to ${option.label}`, { display: 'system' })
  }, [args, mainLoopModel, onDone, setAppState])

  return null
}

function ShowModelAndClose({
  onDone,
}: {
  onDone: OnDone
}): React.ReactNode {
  const mainLoopModel = useAppState(state => state.mainLoopModel)
  const mainLoopModelForSession = useAppState(state => state.mainLoopModelForSession)
  const effortValue = useAppState(state => state.effortValue)

  const modelText = mainLoopModelForSession
    ? `${modelDisplayString(mainLoopModelForSession)} (session override)`
    : modelDisplayString(mainLoopModel)
  const appliedEffort = getEffortApplicationState(
    mainLoopModelForSession ?? mainLoopModel ?? getDefaultMainLoopModel(),
    effortValue,
  ).applied
  const effortText =
    appliedEffort !== undefined ? ` · reasoning: ${appliedEffort}` : ''

  onDone(`Current model: ${modelText}${effortText}`)
  return null
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const normalizedArgs = args?.trim() ?? ''

  if (COMMON_HELP_ARGS.includes(normalizedArgs)) {
    onDone(
      `Usage: /model [${getModelCommandChoices().join('|')}|default]\n\nRun /model with no argument to open the Codex model picker and adjust reasoning.`,
      { display: 'system' },
    )
    return
  }

  if (COMMON_INFO_ARGS.includes(normalizedArgs)) {
    return <ShowModelAndClose onDone={onDone} />
  }

  if (normalizedArgs.length > 0) {
    return <SetModelAndClose args={normalizedArgs} onDone={onDone} />
  }

  return <ModelPickerWrapper onDone={onDone} />
}

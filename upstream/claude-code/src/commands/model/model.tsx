import * as React from 'react'
import { useEffect } from 'react'
import { ModelPicker } from '../../components/ModelPicker.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import type {
  CommandResultDisplay,
  LocalJSXCommandCall,
} from '../../types/command.js'
import type { EffortLevel } from '../../utils/effort.js'
import { modelDisplayString } from '../../utils/model/model.js'
import {
  findCodexModelCapability,
  resolveCodexModelInput,
} from '../../utils/model/codexModels.js'

const COMMON_HELP_ARGS = ['help', '-h', '--help']
const COMMON_INFO_ARGS = ['', 'current', 'status']

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

    const effortSuffix = effort !== undefined ? ` with ${effort} reasoning` : ''
    onDone(`Set model to ${modelDisplayString(model)}${effortSuffix}`)
  }

  function handleCancel(): void {
    const effortSuffix = effortValue !== undefined ? ` (reasoning: ${effortValue})` : ''
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

    const resolved = resolveCodexModelInput(rawInput)
    const capability = findCodexModelCapability(resolved)
    if (!capability) {
      onDone(
        `Unknown model '${rawInput}'. Use /model to pick one of gpt-5.1-codex-mini, gpt-5.1-codex, gpt-5.1-codex-max, or pass default.`,
        { display: 'system' },
      )
      return
    }

    setAppState(prev => ({
      ...prev,
      mainLoopModel: capability.value,
      mainLoopModelForSession: null,
    }))
    onDone(`Set model to ${capability.displayName}`, { display: 'system' })
  }, [args, onDone, setAppState])

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
  const effortText = effortValue !== undefined ? ` · reasoning: ${effortValue}` : ''

  onDone(`Current model: ${modelText}${effortText}`)
  return null
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const normalizedArgs = args?.trim() ?? ''

  if (COMMON_HELP_ARGS.includes(normalizedArgs)) {
    onDone(
      'Usage: /model [gpt-5.1-codex-mini|gpt-5.1-codex|gpt-5.1-codex-max|mini|codex|max|default]\n\nRun /model with no argument to open the Codex model picker and adjust reasoning.',
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

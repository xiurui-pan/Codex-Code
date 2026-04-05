import capitalize from 'lodash-es/capitalize.js'
import * as React from 'react'
import { useState } from 'react'
import { useExitOnCtrlCDWithKeybindings } from 'src/hooks/useExitOnCtrlCDWithKeybindings.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import {
  FAST_MODE_MODEL_DISPLAY,
  isFastModeAvailable,
  isFastModeCooldown,
  isFastModeEnabled,
} from 'src/utils/fastMode.js'
import { Box, Text } from '../ink.js'
import { useRegisterKeybindingContext } from '../keybindings/KeybindingContext.js'
import { useKeybindings } from '../keybindings/useKeybinding.js'
import { useAppState, useSetAppState } from '../state/AppState.js'
import {
  convertEffortValueToLevel,
  type EffortLevel,
  getDefaultEffortForModel,
  getEffortLevelDescription,
  modelSupportsEffort,
  resolvePickerEffortPersistence,
  toPersistableEffort,
} from '../utils/effort.js'
import {
  getDefaultMainLoopModel,
  type ModelSetting,
  modelDisplayString,
  parseUserSpecifiedModel,
} from '../utils/model/model.js'
import { getCodexSupportedEffortLevels } from '../utils/model/codexModels.js'
import { getModelOptions } from '../utils/model/modelOptions.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js'
import { Select } from './CustomSelect/index.js'
import { Byline } from './design-system/Byline.js'
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js'
import { Pane } from './design-system/Pane.js'
import { effortLevelToSymbol } from './EffortIndicator.js'

export type Props = {
  initial: string | null
  sessionModel?: ModelSetting
  onSelect: (model: string | null, effort: EffortLevel | undefined) => void
  onCancel?: () => void
  isStandaloneCommand?: boolean
  showFastModeNotice?: boolean
  headerText?: string
  skipSettingsWrite?: boolean
}

const NO_PREFERENCE = '__NO_PREFERENCE__'

export function ModelPicker({
  initial,
  sessionModel,
  onSelect,
  onCancel,
  isStandaloneCommand,
  showFastModeNotice,
  headerText,
  skipSettingsWrite,
}: Props): React.ReactNode {
  const setAppState = useSetAppState()
  const exitState = useExitOnCtrlCDWithKeybindings()
  useRegisterKeybindingContext('ModelPicker')
  const effortValue = useAppState(state => state.effortValue)
  const isFastMode = useAppState(state => (isFastModeEnabled() ? state.fastMode : false))
  const [hasToggledEffort, setHasToggledEffort] = useState(false)
  const [effort, setEffort] = useState<EffortLevel | undefined>(
    effortValue !== undefined ? convertEffortValueToLevel(effortValue) : undefined,
  )

  const options = getModelOptions({
    extraModels: [initial, sessionModel],
  })
  const initialValue = initial ?? NO_PREFERENCE
  const selectOptions = options.map(option => ({
    ...option,
    value: option.value === null ? NO_PREFERENCE : option.value,
  }))
  const initialFocusValue =
    selectOptions.find(option => option.value === initialValue)?.value ??
    selectOptions[0]?.value
  const [focusedValue, setFocusedValue] = useState(initialFocusValue)
  const focusedModel = resolveOptionModel(focusedValue)
  const supportedLevels = getEffortLevelsForModel(focusedModel)
  const focusedDefaultEffort = getDefaultEffortLevelForOption(focusedValue)
  const displayedEffort = clampEffortLevel(
    effort ?? focusedDefaultEffort,
    supportedLevels,
  )

  useKeybindings(
    {
      'modelPicker:decreaseEffort': () => {
        if (supportedLevels.length <= 1) return
        setEffort(current =>
          cycleEffortLevel(
            clampEffortLevel(current ?? focusedDefaultEffort, supportedLevels),
            'left',
            supportedLevels,
          ),
        )
        setHasToggledEffort(true)
      },
      'modelPicker:increaseEffort': () => {
        if (supportedLevels.length <= 1) return
        setEffort(current =>
          cycleEffortLevel(
            clampEffortLevel(current ?? focusedDefaultEffort, supportedLevels),
            'right',
            supportedLevels,
          ),
        )
        setHasToggledEffort(true)
      },
    },
    { context: 'ModelPicker' },
  )

  function handleFocus(value: string): void {
    setFocusedValue(value)
    if (!hasToggledEffort && effortValue === undefined) {
      setEffort(getDefaultEffortLevelForOption(value))
    }
  }

  function handleSelect(value: string): void {
    logEvent('tengu_model_command_menu_effort', {
      effort: displayedEffort as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    const selectedModel = value === NO_PREFERENCE ? null : value
    const resolvedModel = selectedModel
      ? parseUserSpecifiedModel(selectedModel)
      : getDefaultMainLoopModel()
    const selectedEffort = hasToggledEffort && modelSupportsEffort(resolvedModel)
      ? clampEffortLevel(displayedEffort, getEffortLevelsForModel(resolvedModel))
      : undefined

    if (!skipSettingsWrite) {
      const effortToPersist = resolvePickerEffortPersistence(
        selectedEffort,
        getDefaultEffortLevelForOption(value),
        getSettingsForSource('userSettings')?.effortLevel,
        hasToggledEffort,
      )
      const persistable = toPersistableEffort(effortToPersist)
      updateSettingsForSource('userSettings', {
        effortLevel: persistable,
      })
      setAppState(prev => ({
        ...prev,
        effortValue: effortToPersist,
      }))
    }

    onSelect(selectedModel, selectedEffort)
  }

  const pickerHeader =
    headerText ??
    'Switch Codex model and reasoning. Applies to this session and future Codex Code sessions.'

  const content = (
    <Box flexDirection="column">
      <Box marginBottom={1} flexDirection="column">
        <Text color="remember" bold>
          Select model
        </Text>
        <Text dimColor>{pickerHeader}</Text>
        {sessionModel ? (
          <Text dimColor>
            Currently using {modelDisplayString(sessionModel)} for this session.
            Selecting a model will undo that override.
          </Text>
        ) : null}
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Select
          defaultValue={initialValue}
          defaultFocusValue={initialFocusValue}
          options={selectOptions}
          onChange={handleSelect}
          onFocus={handleFocus}
          onCancel={onCancel}
          visibleOptionCount={Math.min(10, selectOptions.length)}
        />
      </Box>

      <Box marginBottom={1} flexDirection="column">
        {supportedLevels.length > 1 ? (
          <Text dimColor>
            <EffortLevelIndicator effort={displayedEffort} />{' '}
            {capitalize(displayedEffort)} reasoning
            {displayedEffort === focusedDefaultEffort ? ' (default)' : ''} ·{' '}
            {getEffortLevelDescription(displayedEffort)}{' '}
            <Text color="subtle">← → to adjust</Text>
          </Text>
        ) : supportedLevels.length === 1 ? (
          <Text dimColor>
            <EffortLevelIndicator effort={displayedEffort} />{' '}
            {capitalize(displayedEffort)} reasoning (fixed) ·{' '}
            {getEffortLevelDescription(displayedEffort)}
          </Text>
        ) : (
          <Text color="subtle">This model does not support reasoning controls.</Text>
        )}
      </Box>

      {isFastModeEnabled() ? (
        showFastModeNotice ? (
          <Box marginBottom={1}>
            <Text dimColor>
              Fast mode is <Text bold>ON</Text> and available with{' '}
              {FAST_MODE_MODEL_DISPLAY} only (/fast). Switching to other models
              turns fast mode off.
            </Text>
          </Box>
        ) : isFastModeAvailable() && !isFastModeCooldown() ? (
          <Box marginBottom={1}>
            <Text dimColor>
              Use <Text bold>/fast</Text> to turn on Fast mode ({FAST_MODE_MODEL_DISPLAY}{' '}
              only).
            </Text>
          </Box>
        ) : null
      ) : null}

      {isStandaloneCommand ? (
        <Text dimColor italic>
          {exitState.pending ? (
            <>Press {exitState.keyName} again to exit</>
          ) : (
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action="confirm" />
              <ConfigurableShortcutHint
                action="select:cancel"
                context="Select"
                fallback="Esc"
                description="exit"
              />
            </Byline>
          )}
        </Text>
      ) : null}
    </Box>
  )

  return isStandaloneCommand ? <Pane color="permission">{content}</Pane> : content
}

function resolveOptionModel(value?: string): string | undefined {
  if (!value) {
    return undefined
  }

  return value === NO_PREFERENCE
    ? getDefaultMainLoopModel()
    : parseUserSpecifiedModel(value)
}

function getDefaultEffortLevelForOption(value?: string): EffortLevel {
  const resolvedModel = resolveOptionModel(value) ?? getDefaultMainLoopModel()
  return convertEffortValueToLevel(getDefaultEffortForModel(resolvedModel) ?? 'medium')
}

function getEffortLevelsForModel(model: string | undefined): EffortLevel[] {
  if (!model || !modelSupportsEffort(model)) {
    return []
  }

  return [...getCodexSupportedEffortLevels(model)]
}

function clampEffortLevel(
  current: EffortLevel,
  supportedLevels: readonly EffortLevel[],
): EffortLevel {
  if (supportedLevels.includes(current)) {
    return current
  }

  if (supportedLevels.includes('medium')) {
    return 'medium'
  }

  return supportedLevels[0] ?? 'medium'
}

function cycleEffortLevel(
  current: EffortLevel,
  direction: 'left' | 'right',
  supportedLevels: readonly EffortLevel[],
): EffortLevel {
  const currentIndex = supportedLevels.indexOf(current)
  const safeIndex = currentIndex === -1 ? 0 : currentIndex
  const delta = direction === 'right' ? 1 : -1
  return supportedLevels[
    (safeIndex + delta + supportedLevels.length) % supportedLevels.length
  ]!
}

function EffortLevelIndicator({
  effort,
}: {
  effort?: EffortLevel
}): React.ReactNode {
  return <Text color={effort ? 'claude' : 'subtle'}>{effortLevelToSymbol(effort ?? 'medium')}</Text>
}

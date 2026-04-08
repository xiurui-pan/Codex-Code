import type { Command } from '../commands.js'
import { handlePlanModeTransition } from '../bootstrap/state.js'
import type { AppState } from '../state/AppStateStore.js'
import type { LocalJSXCommandCall } from '../types/command.js'
import { enqueuePendingNotification } from '../utils/messageQueueManager.js'
import { applyPermissionUpdate } from '../utils/permissions/PermissionUpdate.js'
import { prepareContextForPlanMode } from '../utils/permissions/permissionSetup.js'
import { getPlan } from '../utils/plans.js'

type LocalUltraplanPromptOptions = {
  goal?: string
  seedPlan?: string
  extraFeedback?: string
}

type LocalUltraplanTurn = {
  enteredPlanMode: boolean
  nextInput: string
  status: string
}

function normalizeSection(text: string | undefined): string | undefined {
  const normalized = text?.trim()
  return normalized ? normalized : undefined
}

export function buildLocalUltraplanPrompt({
  goal,
  seedPlan,
  extraFeedback,
}: LocalUltraplanPromptOptions): string {
  const normalizedGoal = normalizeSection(goal)
  const normalizedPlan = normalizeSection(seedPlan)
  const normalizedFeedback = normalizeSection(extraFeedback)

  const lines = [
    'ultrathink and turn the current task into a stronger, execution-ready plan.',
    '',
    'Work a little harder than a normal planning pass:',
    '- clarify the exact goal, scope, and success bar before locking the plan',
    '- separate confirmed facts from assumptions or missing evidence',
    '- inspect any code, config, or tests that still need confirmation',
    '- compare the realistic approaches when the direction is still open, then pick one',
    '- keep the plan concrete, ordered, minimal, and ready to execute',
    '- include important files, dependencies, checks, or migration notes when they matter',
    '- call out risks, edge cases, and validation steps',
    '- end with the exact first implementation step once the plan is approved',
    '- do not implement anything yet',
    '- stay in plan mode and wait for approval after updating the plan',
  ]

  if (!normalizedGoal && !normalizedPlan) {
    lines.push('', 'Use the current conversation as the source of truth.')
  }

  if (normalizedGoal) {
    lines.push('', 'User goal or latest request:', normalizedGoal)
  }

  if (normalizedFeedback) {
    lines.push('', 'Additional feedback to incorporate:', normalizedFeedback)
  }

  if (normalizedPlan) {
    lines.push('', 'Current draft plan to refine:', normalizedPlan)
  }

  return lines.join('\n')
}

export function prepareLocalUltraplanTurn({
  args,
  currentMode,
  currentPlan,
}: {
  args: string
  currentMode: AppState['toolPermissionContext']['mode']
  currentPlan?: string
}): LocalUltraplanTurn {
  const goal = normalizeSection(args)
  const seedPlan = currentMode === 'plan' ? normalizeSection(currentPlan) : undefined
  const enteredPlanMode = currentMode !== 'plan'
  const nextInput = buildLocalUltraplanPrompt({
    goal,
    seedPlan,
  })

  let status: string
  if (enteredPlanMode) {
    status = seedPlan
      ? 'Enabled plan mode and asked Codex to refine the current plan more deeply'
      : 'Enabled plan mode and asked Codex to produce a deeper plan'
  } else {
    status = seedPlan
      ? 'Asked Codex to refine the current plan more deeply'
      : 'Asked Codex to produce a deeper plan'
  }

  return {
    enteredPlanMode,
    nextInput,
    status,
  }
}

function enablePlanMode(setAppState: (f: (prev: AppState) => AppState) => void, currentMode: AppState['toolPermissionContext']['mode']): void {
  handlePlanModeTransition(currentMode, 'plan')
  setAppState(prev => ({
    ...prev,
    toolPermissionContext: applyPermissionUpdate(
      prepareContextForPlanMode(prev.toolPermissionContext),
      {
        type: 'setMode',
        mode: 'plan',
        destination: 'session',
      },
    ),
  }))
}

export async function launchUltraplan(opts: {
  blurb: string
  seedPlan?: string
  getAppState: () => AppState
  setAppState: (f: (prev: AppState) => AppState) => void
  signal: AbortSignal
  disconnectedBridge?: boolean
  onSessionReady?: (msg: string) => void
}): Promise<string> {
  const currentMode = opts.getAppState().toolPermissionContext.mode
  const turn = prepareLocalUltraplanTurn({
    args: opts.blurb,
    currentMode,
    currentPlan: opts.seedPlan,
  })

  if (turn.enteredPlanMode && !opts.signal.aborted) {
    enablePlanMode(opts.setAppState, currentMode)
  }

  opts.onSessionReady?.(turn.status)
  return turn.status
}

export async function stopUltraplan(
  _taskId: string,
  _sessionId: string,
  _setAppState: (f: (prev: AppState) => AppState) => void,
): Promise<void> {
  enqueuePendingNotification({
    value:
      'Ultraplan now runs in this session. There is no separate background session to stop.',
    mode: 'task-notification',
  })
}

const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const currentMode = context.getAppState().toolPermissionContext.mode
  const turn = prepareLocalUltraplanTurn({
    args,
    currentMode,
    currentPlan: getPlan() ?? undefined,
  })

  if (turn.enteredPlanMode) {
    enablePlanMode(context.setAppState, currentMode)
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  onDone(turn.status, {
    display: 'system',
    nextInput: turn.nextInput,
    submitNextInput: true,
  })
  return null
}

export default {
  type: 'local-jsx',
  name: 'ultraplan',
  description:
    'Ask Codex to stay in plan mode and produce a deeper, execution-ready plan in this session',
  argumentHint: '[task or change request]',
  load: () => Promise.resolve({ call }),
} satisfies Command

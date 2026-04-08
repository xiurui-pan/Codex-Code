import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildLocalUltraplanPrompt,
  prepareLocalUltraplanTurn,
} from '../src/commands/ultraplan.js'
import { getUltrathinkEffortLevel } from '../src/utils/effort.js'

test('local ultraplan prompt keeps the useful planning guidance without web-session copy', () => {
  const prompt = buildLocalUltraplanPrompt({
    goal: 'Fix the broken resume flow',
    seedPlan: '- inspect session restore\n- patch transcript loading',
    extraFeedback: 'Also verify compact output order.',
  })

  assert.match(
    prompt,
    /ultrathink and turn the current task into a stronger, execution-ready plan\./,
  )
  assert.match(prompt, /User goal or latest request:/)
  assert.match(prompt, /Additional feedback to incorporate:/)
  assert.match(prompt, /Current draft plan to refine:/)
  assert.match(prompt, /clarify the exact goal, scope, and success bar/)
  assert.match(prompt, /separate confirmed facts from assumptions or missing evidence/)
  assert.match(prompt, /end with the exact first implementation step once the plan is approved/)
  assert.match(prompt, /stay in plan mode and wait for approval/)
  assert.doesNotMatch(prompt, /ultraplan/i)
  assert.doesNotMatch(prompt, /Codex Code on the web/)
})

test('local ultraplan turn enters plan mode only when needed', () => {
  const freshTurn = prepareLocalUltraplanTurn({
    args: 'Audit the compaction triggers',
    currentMode: 'default',
  })
  const refineTurn = prepareLocalUltraplanTurn({
    args: '',
    currentMode: 'plan',
    currentPlan: '- gather evidence\n- tighten the plan',
  })

  assert.equal(freshTurn.enteredPlanMode, true)
  assert.match(freshTurn.status, /Enabled plan mode/)
  assert.match(freshTurn.nextInput, /Audit the compaction triggers/)

  assert.equal(refineTurn.enteredPlanMode, false)
  assert.match(refineTurn.status, /refine the current plan more deeply/)
  assert.match(refineTurn.nextInput, /Current draft plan to refine:/)
})

test('ultrathink chooses the highest reasoning effort the current codex model supports', () => {
  const originalProvider = process.env.CODEX_CODE_USE_CODEX_PROVIDER

  process.env.CODEX_CODE_USE_CODEX_PROVIDER = '1'
  try {
    assert.equal(getUltrathinkEffortLevel('gpt-5.4'), 'xhigh')
    assert.equal(getUltrathinkEffortLevel('gpt-5.1-codex-mini'), 'high')
  } finally {
    if (originalProvider === undefined) {
      delete process.env.CODEX_CODE_USE_CODEX_PROVIDER
    } else {
      process.env.CODEX_CODE_USE_CODEX_PROVIDER = originalProvider
    }
  }
})

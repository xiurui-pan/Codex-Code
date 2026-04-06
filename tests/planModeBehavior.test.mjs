import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { closeSync, openSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

const loaderPath = join(projectRoot, 'dist', 'loader.mjs')

function makeEnv(overrides = {}) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key]
    } else {
      env[key] = value
    }
  }
  return env
}

async function runInlineModule(source, envOverrides = {}) {
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-plan-inline-'))
  const stdoutPath = join(tempDir, 'stdout.txt')
  const stderrPath = join(tempDir, 'stderr.txt')
  const stdoutFd = openSync(stdoutPath, 'w')
  const stderrFd = openSync(stderrPath, 'w')
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', '--loader', loaderPath, '--input-type=module', '-e', source],
    {
      cwd: projectRoot,
      env: makeEnv(envOverrides),
      stdio: ['ignore', stdoutFd, stderrFd],
    },
  )
  try {
    const [code] = await once(child, 'close')
    const [stdout, stderr] = await Promise.all([
      readFile(stdoutPath, 'utf8'),
      readFile(stderrPath, 'utf8'),
    ])
    assert.equal(code, 0, stderr || `child exited with ${code}`)
    return stdout.trim()
  } finally {
    closeSync(stdoutFd)
    closeSync(stderrFd)
    await rm(tempDir, { recursive: true, force: true })
  }
}

test('custom Codex provider does not force plan mode into iterative interview workflow', async () => {
  const probe = [
    "import { isPlanModeInterviewPhaseEnabled } from './src/utils/planModeV2.ts'",
    'process.stdout.write(JSON.stringify({ interview: isPlanModeInterviewPhaseEnabled() }))',
  ].join('\n')

  const defaultState = JSON.parse(
    await runInlineModule(probe, {
      USER_TYPE: undefined,
      CODEX_CODE_USE_CODEX_PROVIDER: undefined,
      CODEX_CODE_PLAN_MODE_INTERVIEW_PHASE: '0',
    }),
  )
  assert.equal(defaultState.interview, false)

  const codexProviderState = JSON.parse(
    await runInlineModule(probe, {
      USER_TYPE: undefined,
      CODEX_CODE_USE_CODEX_PROVIDER: '1',
      CODEX_CODE_PLAN_MODE_INTERVIEW_PHASE: '0',
    }),
  )
  assert.equal(codexProviderState.interview, false)
})

test('custom Codex provider full plan-mode payload uses convergent 5-phase workflow', async () => {
  const probe = [
    "import { normalizeAttachmentForAPI } from './src/utils/messages.ts'",
    "const messages = normalizeAttachmentForAPI({ type: 'plan_mode', reminderType: 'full', planFilePath: '/tmp/test-plan.md', planExists: false })",
    "const content = messages.map(message => typeof message.message?.content === 'string' ? message.message.content : Array.isArray(message.message?.content) ? message.message.content.map(block => block.type === 'text' ? block.text : '').join('\\n') : '').join('\\n')",
    'process.stdout.write(JSON.stringify({',
    "  hasPlanWorkflow: content.includes('## Plan Workflow'),",
    "  hasConvergenceRule: content.includes('### Convergence Rule'),",
    "  waitsForApproval: content.includes('wait for approval before any implementation begins'),",
    "  blocksBroadRereads: content.includes('Main session should not duplicate broad searches already delegated.'),",
    "  usesIterativeWorkflow: content.includes('## Iterative Planning Workflow'),",
    "  repeatsCycle: content.includes('Repeat this cycle until the plan is complete'),",
    "  goesBackToStep1: content.includes('Then go back to step 1'),",
    '}))',
  ].join('\n')

  const payloadState = JSON.parse(
    await runInlineModule(probe, {
      USER_TYPE: undefined,
      CODEX_CODE_USE_CODEX_PROVIDER: '1',
      CODEX_CODE_PLAN_MODE_INTERVIEW_PHASE: '0',
    }),
  )

  assert.equal(payloadState.hasPlanWorkflow, true)
  assert.equal(payloadState.hasConvergenceRule, true)
  assert.equal(payloadState.waitsForApproval, true)
  assert.equal(payloadState.blocksBroadRereads, true)
  assert.equal(payloadState.usesIterativeWorkflow, false)
  assert.equal(payloadState.repeatsCycle, false)
  assert.equal(payloadState.goesBackToStep1, false)
})

test('custom Codex provider sparse reminder stays on the 5-phase workflow', async () => {
  const probe = [
    "import { normalizeAttachmentForAPI } from './src/utils/messages.ts'",
    "const messages = normalizeAttachmentForAPI({ type: 'plan_mode', reminderType: 'sparse', planFilePath: '/tmp/test-plan.md', planExists: false })",
    "const content = messages.map(message => typeof message.message?.content === 'string' ? message.message.content : Array.isArray(message.message?.content) ? message.message.content.map(block => block.type === 'text' ? block.text : '').join('\\n') : '').join('\\n')",
    'process.stdout.write(JSON.stringify({',
    "  usesFivePhaseReminder: content.includes('Follow 5-phase workflow.'),",
    "  usesIterativeReminder: content.includes('Follow iterative workflow:'),",
    '}))',
  ].join('\n')

  const reminderState = JSON.parse(
    await runInlineModule(probe, {
      USER_TYPE: undefined,
      CODEX_CODE_USE_CODEX_PROVIDER: '1',
      CODEX_CODE_PLAN_MODE_INTERVIEW_PHASE: '0',
    }),
  )

  assert.equal(reminderState.usesFivePhaseReminder, true)
  assert.equal(reminderState.usesIterativeReminder, false)
})

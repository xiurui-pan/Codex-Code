import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { projectRoot } from './helpers/projectRoot.mjs'

function makeEnv(overrides = {}) {
  const env = { ...process.env }
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
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', '--loader', './dist/loader.mjs', '--input-type=module', '-e', source],
    {
      cwd: projectRoot,
      env: makeEnv(envOverrides),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    stdout += chunk
  })
  child.stderr.on('data', chunk => {
    stderr += chunk
  })

  const [code] = await once(child, 'close')
  assert.equal(code, 0, stderr || `child exited with ${code}`)
  return stdout.trim()
}

test('custom Codex provider keeps plan mode in iterative interview workflow', async () => {
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
  assert.equal(codexProviderState.interview, true)
})

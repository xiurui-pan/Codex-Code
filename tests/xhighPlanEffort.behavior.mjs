import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { closeSync, openSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

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
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-xhighplan-inline-'))
  const stdoutPath = join(tempDir, 'stdout.txt')
  const stderrPath = join(tempDir, 'stderr.txt')
  const stdoutFd = openSync(stdoutPath, 'w')
  const stderrFd = openSync(stderrPath, 'w')
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', '--loader', './dist/loader.mjs', '--input-type=module', '-e', source],
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

test('XhighPlan keeps medium outside plan mode and raises effort inside plan mode', async () => {
  const probe = [
    "import { resolveAppliedEffort } from './src/utils/effort.ts'",
    'const normal = resolveAppliedEffort("gpt-5.4", undefined, "default")',
    'const plan = resolveAppliedEffort("gpt-5.4", undefined, "plan")',
    'process.stdout.write(JSON.stringify({ normal, plan }))',
  ].join('\n')

  const result = JSON.parse(
    await runInlineModule(probe, {
      CODEX_CODE_USE_CODEX_PROVIDER: '1',
      ANTHROPIC_MODEL: 'xhighplan',
    }),
  )

  assert.equal(result.normal, 'medium')
  assert.equal(result.plan, 'xhigh')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

test('BUDDY defaults off but can be explicitly enabled', async () => {
  const probe = [
    "import { feature } from './shims/bun-bundle.ts'",
    "process.stdout.write(JSON.stringify({ buddy: feature('BUDDY') }))",
  ].join('\n')

  const defaultState = JSON.parse(
    await runInlineModule(probe, {
      CLAUDE_CODE_FEATURE_BUDDY: undefined,
      CLAUDE_CODE_ENABLED_FEATURES: undefined,
    }),
  )
  assert.equal(defaultState.buddy, false)

  const enabledState = JSON.parse(
    await runInlineModule(probe, {
      CLAUDE_CODE_FEATURE_BUDDY: '1',
      CLAUDE_CODE_ENABLED_FEATURES: undefined,
    }),
  )
  assert.equal(enabledState.buddy, true)
})

test('auto-dream defaults on when unset but respects settings override', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-code-feature-defaults-'))
  const claudeDir = join(tempDir, '.claude')
  await mkdir(claudeDir, { recursive: true })

  const probe = [
    "import { isAutoDreamEnabled } from './src/services/autoDream/config.ts'",
    'process.stdout.write(JSON.stringify({ autoDream: isAutoDreamEnabled() }))',
  ].join('\n')

  try {
    const defaultState = JSON.parse(
      await runInlineModule(probe, {
        CLAUDE_CONFIG_DIR: claudeDir,
        CODEX_CODE_USE_CODEX_PROVIDER: '1',
      }),
    )
    assert.equal(defaultState.autoDream, true)

    await writeFile(
      join(claudeDir, 'settings.json'),
      JSON.stringify({ autoDreamEnabled: false }, null, 2) + '\n',
      'utf8',
    )

    const disabledState = JSON.parse(
      await runInlineModule(probe, {
        CLAUDE_CONFIG_DIR: claudeDir,
        CODEX_CODE_USE_CODEX_PROVIDER: '1',
      }),
    )
    assert.equal(disabledState.autoDream, false)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

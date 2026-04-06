import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { closeSync, openSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
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
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-command-inline-'))
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

test('Codex provider hides Claude-product slash commands from the command list', async () => {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-command-surface-'))
  const claudeDir = join(tempHome, '.claude')
  await mkdir(claudeDir, { recursive: true })

  try {
    const probe = [
      "import { getCommands } from './src/commands.ts'",
      'const commands = await getCommands(process.cwd())',
      'process.stdout.write(JSON.stringify(commands.map(c => c.name).sort()))',
    ].join('\n')

    const names = JSON.parse(
      await runInlineModule(probe, {
        NODE_ENV: 'test',
        CODEX_CODE_USE_CODEX_PROVIDER: '1',
        HOME: tempHome,
        CLAUDE_CONFIG_DIR: claudeDir,
      }),
    )

    for (const hiddenName of [
      'chrome',
      'desktop',
      'feedback',
      'insights',
      'install-github-app',
      'install-slack-app',
      'login',
      'logout',
      'mobile',
      'passes',
      'privacy-settings',
      'rate-limit-options',
      'remote-env',
      'statusline',
      'stickers',
      'teleport',
      'think-back',
      'think-back-play',
      'upgrade',
      'usage',
      'voice',
      'web-setup',
    ]) {
      assert.ok(!names.includes(hiddenName), `${hiddenName} should be hidden`)
    }

    for (const visibleName of ['fast', 'help', 'memory', 'model', 'plan', 'plugin']) {
      assert.ok(names.includes(visibleName), `${visibleName} should stay visible`)
    }
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
})

test('Codex provider spinner tips stop suggesting hidden Claude-product features', async () => {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-tip-surface-'))
  const claudeDir = join(tempHome, '.claude')
  await mkdir(claudeDir, { recursive: true })

  try {
    const probe = [
      "import { getRelevantTips } from './src/services/tips/tipRegistry.ts'",
      'const tips = await getRelevantTips()',
      "const ids = ['install-github-app', 'install-slack-app', 'desktop-app', 'desktop-shortcut', 'mobile-app', 'web-app']",
      'const selected = []',
      'for (const id of ids) { if (tips.find(t => t.id === id)) selected.push(id) }',
      "const continueTip = tips.find(t => t.id === 'continue')",
      'const continueText = continueTip ? await continueTip.content({ theme: "dark" }) : null',
      'process.stdout.write(JSON.stringify({ selected, continueText }))',
    ].join('\n')

    const result = JSON.parse(
      await runInlineModule(probe, {
        NODE_ENV: 'test',
        CODEX_CODE_USE_CODEX_PROVIDER: '1',
        HOME: tempHome,
        CLAUDE_CONFIG_DIR: claudeDir,
      }),
    )

    assert.deepEqual(result.selected, [])
    assert.equal(
      result.continueText,
      'Run codex-code --continue or codex-code --resume to resume a conversation',
    )
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
})

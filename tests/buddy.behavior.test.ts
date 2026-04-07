import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { closeSync, openSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { projectRoot } from './helpers/projectRoot.mjs'

const BUDDY_TEST_ENV = {
  NODE_ENV: 'test',
  CLAUDE_CODE_FEATURE_BUDDY: '1',
  CLAUDE_CODE_ENABLED_FEATURES: 'BUDDY',
  CODEX_CODE_USE_FILE_BACKED_TEST_CONFIG: '1',
}

async function runInlineBuddyModule(source: string) {
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-buddy-inline-'))
  const stdoutPath = join(tempDir, 'stdout.txt')
  const stderrPath = join(tempDir, 'stderr.txt')
  const stdoutFd = openSync(stdoutPath, 'w')
  const stderrFd = openSync(stderrPath, 'w')

  const child = spawn(
    process.execPath,
    ['--import', 'tsx', '--loader', './dist/loader.mjs', '--input-type=module', '-e', source],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        ...BUDDY_TEST_ENV,
      },
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
    return JSON.parse(stdout.trim())
  } finally {
    closeSync(stdoutFd)
    closeSync(stderrFd)
    await rm(tempDir, { recursive: true, force: true })
  }
}

test('buddy command hatches a deterministic companion without provider work', async () => {
  const result = await runInlineBuddyModule(`
    import { mkdtemp, mkdir, rm } from 'node:fs/promises'
    import { join } from 'node:path'
    import { tmpdir } from 'node:os'
    import { resetStateForTests } from './src/bootstrap/state.js'
    import { call as buddyCommand } from './src/commands/buddy/buddy.js'
    import { getGlobalConfig } from './src/utils/config.js'

    const tempDir = await mkdtemp(join(tmpdir(), 'codex-buddy-behavior-'))
    process.env.HOME = tempDir
    process.env.CLAUDE_CONFIG_DIR = join(tempDir, '.claude')
    await mkdir(process.env.CLAUDE_CONFIG_DIR, { recursive: true })
    resetStateForTests()

    const state = { appState: { companionReaction: undefined, companionPetAt: undefined } }
    const context = { setAppState(updater) { state.appState = updater(state.appState) } }

    try {
      const firstResult = await buddyCommand('', context)
      const firstName = getGlobalConfig().companion?.name
      const secondResult = await buddyCommand('', context)
      const secondName = getGlobalConfig().companion?.name
      process.stdout.write(JSON.stringify({ firstResult, firstName, secondResult, secondName }))
    } finally {
      resetStateForTests()
      await rm(tempDir, { recursive: true, force: true })
    }
  `)

  assert.equal(result.firstResult.type, 'text')
  assert.match(result.firstResult.value, /Buddy hatched:/)
  assert.equal(typeof result.firstName, 'string')
  assert.equal(result.secondResult.type, 'text')
  assert.match(result.secondResult.value, /Buddy ready:/)
  assert.equal(result.secondName, result.firstName)
})

test('buddy pet updates the transient app state', async () => {
  const result = await runInlineBuddyModule(`
    import { mkdtemp, mkdir, rm } from 'node:fs/promises'
    import { join } from 'node:path'
    import { tmpdir } from 'node:os'
    import { resetStateForTests } from './src/bootstrap/state.js'
    import { call as buddyCommand } from './src/commands/buddy/buddy.js'

    const tempDir = await mkdtemp(join(tmpdir(), 'codex-buddy-behavior-'))
    process.env.HOME = tempDir
    process.env.CLAUDE_CONFIG_DIR = join(tempDir, '.claude')
    await mkdir(process.env.CLAUDE_CONFIG_DIR, { recursive: true })
    resetStateForTests()

    const state = { appState: { companionReaction: undefined, companionPetAt: undefined } }
    const context = { setAppState(updater) { state.appState = updater(state.appState) } }

    try {
      const commandResult = await buddyCommand('pet', context)
      process.stdout.write(JSON.stringify({ commandResult, appState: state.appState }))
    } finally {
      resetStateForTests()
      await rm(tempDir, { recursive: true, force: true })
    }
  `)

  assert.equal(result.commandResult.type, 'text')
  assert.match(result.commandResult.value, /pet/i)
  assert.equal(typeof result.appState.companionReaction, 'string')
  assert.equal(typeof result.appState.companionPetAt, 'number')
})

test('buddy mute and unmute persist their state', async () => {
  const result = await runInlineBuddyModule(`
    import { mkdtemp, mkdir, rm } from 'node:fs/promises'
    import { join } from 'node:path'
    import { tmpdir } from 'node:os'
    import { resetStateForTests } from './src/bootstrap/state.js'
    import { call as buddyCommand } from './src/commands/buddy/buddy.js'
    import { getGlobalConfig } from './src/utils/config.js'

    const tempDir = await mkdtemp(join(tmpdir(), 'codex-buddy-behavior-'))
    process.env.HOME = tempDir
    process.env.CLAUDE_CONFIG_DIR = join(tempDir, '.claude')
    await mkdir(process.env.CLAUDE_CONFIG_DIR, { recursive: true })
    resetStateForTests()

    const state = { appState: { companionReaction: undefined, companionPetAt: undefined } }
    const context = { setAppState(updater) { state.appState = updater(state.appState) } }

    try {
      const hatchResult = await buddyCommand('', context)
      const companionName = getGlobalConfig().companion?.name
      const muteResult = await buddyCommand('mute', context)
      const muted = getGlobalConfig().companionMuted
      const persistedCompanion = getGlobalConfig().companion
      const unmuteResult = await buddyCommand('unmute', context)
      const unmuted = getGlobalConfig().companionMuted
      process.stdout.write(JSON.stringify({ hatchResult, companionName, muteResult, muted, persistedCompanion, unmuteResult, unmuted }))
    } finally {
      resetStateForTests()
      await rm(tempDir, { recursive: true, force: true })
    }
  `)

  assert.equal(result.hatchResult.type, 'text')
  assert.match(result.hatchResult.value, /Buddy (hatched|ready):/)
  assert.equal(typeof result.companionName, 'string')
  assert.equal(result.muteResult.type, 'text')
  assert.match(result.muteResult.value, /muted/i)
  assert.equal(result.muted, true)
  assert.ok(result.persistedCompanion)
  assert.equal(result.unmuteResult.type, 'text')
  assert.match(result.unmuteResult.value, new RegExp(`${result.companionName} is back beside the prompt`, 'i'))
  assert.equal(result.unmuted, false)
})

test('buddy reports disabled status when the feature flag is off', async () => {
  const result = await runInlineBuddyModule(`
    import { mkdtemp, mkdir, rm } from 'node:fs/promises'
    import { join } from 'node:path'
    import { tmpdir } from 'node:os'
    import { resetStateForTests } from './src/bootstrap/state.js'
    import { call as buddyCommand } from './src/commands/buddy/buddy.js'

    const tempDir = await mkdtemp(join(tmpdir(), 'codex-buddy-behavior-'))
    process.env.HOME = tempDir
    process.env.CLAUDE_CONFIG_DIR = join(tempDir, '.claude')
    process.env.CLAUDE_CODE_FEATURE_BUDDY = '0'
    delete process.env.CLAUDE_CODE_ENABLED_FEATURES
    await mkdir(process.env.CLAUDE_CONFIG_DIR, { recursive: true })
    resetStateForTests()

    const state = { appState: { companionReaction: undefined, companionPetAt: undefined } }
    const context = { setAppState(updater) { state.appState = updater(state.appState) } }

    try {
      const commandResult = await buddyCommand('status', context)
      process.stdout.write(JSON.stringify({ commandResult }))
    } finally {
      resetStateForTests()
      await rm(tempDir, { recursive: true, force: true })
    }
  `)

  assert.equal(result.commandResult.type, 'text')
  assert.match(result.commandResult.value, /not enabled/i)
})

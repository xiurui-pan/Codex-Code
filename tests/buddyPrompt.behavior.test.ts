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

test('companion observer reacts when the user addresses the buddy by name', async () => {
  const result = await runInlineBuddyModule(`
    import { mkdtemp, mkdir, rm } from 'node:fs/promises'
    import { join } from 'node:path'
    import { tmpdir } from 'node:os'
    import { resetStateForTests } from './src/bootstrap/state.js'
    import { createAssistantMessage, createUserMessage } from './src/utils/messages.js'
    import { call as buddyCommand } from './src/commands/buddy/buddy.js'
    import { getGlobalConfig } from './src/utils/config.js'
    import { fireCompanionObserver } from './src/buddy/observer.js'

    const tempDir = await mkdtemp(join(tmpdir(), 'codex-buddy-behavior-'))
    process.env.HOME = tempDir
    process.env.CLAUDE_CONFIG_DIR = join(tempDir, '.claude')
    await mkdir(process.env.CLAUDE_CONFIG_DIR, { recursive: true })
    resetStateForTests()

    const state = { appState: { companionReaction: undefined, companionPetAt: undefined } }
    const context = { setAppState(updater) { state.appState = updater(state.appState) } }

    try {
      await buddyCommand('', context)
      const companion = getGlobalConfig().companion
      let reaction
      fireCompanionObserver(
        [
          createUserMessage({ content: 'hey ' + companion.name + ', any thoughts?' }),
          createAssistantMessage({ content: 'Sure - here is a concise plan.' }),
        ],
        value => {
          reaction = value
        },
      )
      process.stdout.write(JSON.stringify({ companion, reaction }))
    } finally {
      resetStateForTests()
      await rm(tempDir, { recursive: true, force: true })
    }
  `)

  assert.ok(result.companion)
  assert.equal(typeof result.reaction, 'string')
  assert.match(result.reaction ?? '', new RegExp(result.companion.name))
})

test('companion observer and prompt attachment stay silent while muted', async () => {
  const result = await runInlineBuddyModule(`
    import { mkdtemp, mkdir, rm } from 'node:fs/promises'
    import { join } from 'node:path'
    import { tmpdir } from 'node:os'
    import { randomUUID } from 'node:crypto'
    import { resetStateForTests } from './src/bootstrap/state.js'
    import { createAssistantMessage, createUserMessage } from './src/utils/messages.js'
    import { createAttachmentMessage } from './src/utils/attachments.js'
    import { call as buddyCommand } from './src/commands/buddy/buddy.js'
    import { getGlobalConfig } from './src/utils/config.js'
    import { fireCompanionObserver } from './src/buddy/observer.js'
    import { getCompanionIntroAttachment } from './src/buddy/prompt.js'

    const tempDir = await mkdtemp(join(tmpdir(), 'codex-buddy-behavior-'))
    process.env.HOME = tempDir
    process.env.CLAUDE_CONFIG_DIR = join(tempDir, '.claude')
    await mkdir(process.env.CLAUDE_CONFIG_DIR, { recursive: true })
    resetStateForTests()

    const state = { appState: { companionReaction: undefined, companionPetAt: undefined } }
    const context = { setAppState(updater) { state.appState = updater(state.appState) } }

    try {
      await buddyCommand('', context)
      await buddyCommand('mute', context)
      const companion = getGlobalConfig().companion
      let reaction
      fireCompanionObserver(
        [
          createUserMessage({ content: 'hello ' + companion.name }),
          createAssistantMessage({ content: 'hi' }),
        ],
        value => {
          reaction = value
        },
      )
      const attachments = getCompanionIntroAttachment([
        createAttachmentMessage({
          type: 'other_attachment',
          token: randomUUID(),
        }),
      ])
      process.stdout.write(JSON.stringify({ companion, reaction, attachments }))
    } finally {
      resetStateForTests()
      await rm(tempDir, { recursive: true, force: true })
    }
  `)

  assert.ok(result.companion)
  assert.equal(result.reaction, undefined)
  assert.deepEqual(result.attachments, [])
})

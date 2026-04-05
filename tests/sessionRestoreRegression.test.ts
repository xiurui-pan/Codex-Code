import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { resetStateForTests, setOriginalCwd, switchSession } from '../src/bootstrap/state.js'
import { asSessionId } from '../src/types/ids.js'
import { createAssistantMessage, createSystemMessage, createUserMessage } from '../src/utils/messages.js'
import { getLastSessionLog, getProjectDir, getProjectsDir } from '../src/utils/sessionStorage.js'

let tempDir: string | null = null
let originalHome: string | undefined
let originalClaudeConfigDir: string | undefined

afterEach(async () => {
  resetStateForTests()
  if (originalHome === undefined) {
    delete process.env.HOME
  } else {
    process.env.HOME = originalHome
  }
  if (originalClaudeConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
    tempDir = null
  }
})

test('getLastSessionLog resumes from the latest visible leaf instead of a later side branch message', async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'codex-session-restore-'))
  originalHome = process.env.HOME
  originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.HOME = tempDir
  process.env.CLAUDE_CONFIG_DIR = join(tempDir, '.claude')

  const projectDir = join(tempDir, 'project')
  await mkdir(projectDir, { recursive: true })

  const sessionId = randomUUID()
  setOriginalCwd(projectDir)

  // Session storage writes to ~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl
  const storageProjectDir = getProjectDir(projectDir)
  await mkdir(storageProjectDir, { recursive: true })

  // switchSession's projectDir is the directory containing the .jsonl files,
  // not the working directory.
  switchSession(asSessionId(sessionId), storageProjectDir)

  const transcriptPath = join(storageProjectDir, `${sessionId}.jsonl`)

  const user1 = {
    ...createUserMessage({ content: 'first question' }),
    sessionId,
    parentUuid: null,
    isSidechain: false,
    timestamp: '2026-04-05T00:00:00.000Z',
  }
  const assistant1 = {
    ...createAssistantMessage({ content: 'first answer' }),
    sessionId,
    parentUuid: user1.uuid,
    isSidechain: false,
    timestamp: '2026-04-05T00:00:01.000Z',
  }
  const user2 = {
    ...createUserMessage({ content: 'second question' }),
    sessionId,
    parentUuid: assistant1.uuid,
    isSidechain: false,
    timestamp: '2026-04-05T00:00:02.000Z',
  }
  const assistant2 = {
    ...createAssistantMessage({ content: 'second answer' }),
    sessionId,
    parentUuid: user2.uuid,
    isSidechain: false,
    timestamp: '2026-04-05T00:00:03.000Z',
  }
  const trailingSystemBranch = {
    ...createSystemMessage('later informational branch', 'info'),
    parentUuid: assistant1.uuid,
    isSidechain: false,
    sessionId,
    timestamp: '2026-04-05T00:00:04.000Z',
  }

  await writeFile(
    transcriptPath,
    [
      user1,
      assistant1,
      user2,
      assistant2,
      trailingSystemBranch,
    ]
      .map(entry => JSON.stringify(entry))
      .join('\n') + '\n',
    'utf8',
  )

  const log = await getLastSessionLog(sessionId)

  assert.notEqual(log, null)
  assert.deepEqual(log?.messages.map(message => `${message.type}:${message.uuid}`), [
    `user:${user1.uuid}`,
    `assistant:${assistant1.uuid}`,
    `user:${user2.uuid}`,
    `assistant:${assistant2.uuid}`,
  ])
})

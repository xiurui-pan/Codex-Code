import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { resetStateForTests, setOriginalCwd, switchSession } from '../src/bootstrap/state.js'
import { asSessionId } from '../src/types/ids.js'
import { createAssistantMessage, createSystemMessage, createUserMessage } from '../src/utils/messages.js'
import { getLastSessionLog } from '../src/utils/sessionStorage.js'

let tempDir: string | null = null

afterEach(async () => {
  resetStateForTests()
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
    tempDir = null
  }
})

test('getLastSessionLog resumes from the latest visible leaf instead of a later side branch message', async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'codex-session-restore-'))
  const projectDir = join(tempDir, 'project')
  await mkdir(projectDir, { recursive: true })

  const sessionId = randomUUID()
  const transcriptPath = join(projectDir, `${sessionId}.jsonl`)
  setOriginalCwd(projectDir)
  switchSession(asSessionId(sessionId), projectDir)

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

  expect(log).not.toBeNull()
  expect(log?.messages.map(message => `${message.type}:${message.uuid}`)).toEqual([
    `user:${user1.uuid}`,
    `assistant:${assistant1.uuid}`,
    `user:${user2.uuid}`,
    `assistant:${assistant2.uuid}`,
  ])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'

function sanitizePath(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '-')
}

async function writeSessionMemorySummary({
  projectDir,
  memoryPath,
  content,
  waitForExistingSummary = false,
}) {
  async function collectCandidateMemoryPaths() {
    const projectEntries = await readdir(projectDir, { withFileTypes: true })
    const candidateMemoryPaths = new Set([memoryPath])
    for (const entry of projectEntries) {
      if (entry.isDirectory() && /^[0-9a-f-]{36}$/i.test(entry.name)) {
        candidateMemoryPaths.add(
          join(projectDir, entry.name, 'session-memory', 'summary.md'),
        )
      }
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        const candidateId = entry.name.slice(0, -'.jsonl'.length)
        if (/^[0-9a-f-]{36}$/i.test(candidateId)) {
          candidateMemoryPaths.add(
            join(projectDir, candidateId, 'session-memory', 'summary.md'),
          )
        }
      }
    }
    return [...candidateMemoryPaths]
  }

  if (waitForExistingSummary) {
    const deadline = Date.now() + 20000
    let stableSince = 0
    let stableKey = ''
    while (Date.now() < deadline) {
      try {
        const candidateMemoryPaths = await collectCandidateMemoryPaths()
        const readySummaries = []
        for (const candidateMemoryPath of candidateMemoryPaths) {
          try {
            const candidateStats = await stat(candidateMemoryPath)
            if (candidateStats.isFile()) {
              readySummaries.push(`${candidateMemoryPath}:${candidateStats.mtimeMs}`)
            }
          } catch {}
        }
        if (readySummaries.length > 0) {
          readySummaries.sort()
          const nextStableKey = readySummaries.join('|')
          if (nextStableKey !== stableKey) {
            stableKey = nextStableKey
            stableSince = Date.now()
          } else if (Date.now() - stableSince >= 1500) {
            break
          }
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  } else {
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  const candidateMemoryPaths = await collectCandidateMemoryPaths()
  for (const candidateMemoryPath of candidateMemoryPaths) {
    await mkdir(join(candidateMemoryPath, '..'), { recursive: true })
    await writeFile(candidateMemoryPath, content, 'utf8')
  }
}

function getCompactSummaryText(transcript) {
  const match = transcript.match(
    /The summary below covers the earlier portion of the conversation\.\n\n([\s\S]*?)\n\nIf you need specific details from before compaction/,
  )
  return match?.[1] ?? ''
}

async function runSession({ queries, responseBatches }) {
  const seenRequestBodies = []
  const stdoutMessages = []
  const stderrChunks = []
  const sockets = new Set()
  const cwd = '/home/pxr/workspace/CodingAgent/Codex-Code/upstream/claude-code'
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-session-memory-home-'))
  const claudeDir = join(tempHome, '.claude')
  const codexDir = join(tempHome, '.codex')
  await mkdir(claudeDir, { recursive: true })
  await mkdir(codexDir, { recursive: true })

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/responses') {
      res.statusCode = 404
      res.end('not found')
      return
    }
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })
    req.on('end', async () => {
      seenRequestBodies.push(JSON.parse(body))
      const batch = responseBatches[seenRequestBodies.length - 1] ?? []
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        connection: 'keep-alive',
        'cache-control': 'no-cache',
      })
      for (const step of batch) {
        res.write(step)
      }
      res.end()
    })
  })
  server.on('connection', socket => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('failed to bind test server')
  }

  await writeFile(
    join(codexDir, 'config.toml'),
    [
      'model_provider = "test-provider"',
      'model = "gpt-5.1-codex-mini"',
      'model_reasoning_effort = "medium"',
      '',
      '[model_providers.test-provider]',
      `base_url = "http://127.0.0.1:${address.port}"`,
      'env_key = "ANTHROPIC_API_KEY"',
      '',
    ].join('\n'),
  )

  const child = spawn(
    'node',
    [
      'dist/cli.js',
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--debug-to-stderr',
    ],
    {
      cwd,
      env: {
        ...process.env,
        HOME: tempHome,
        ANTHROPIC_API_KEY: 'test-key',
        CLAUDE_CODE_USE_CODEX_PROVIDER: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )

  let stdoutBuffer = ''
  let resultCount = 0
  const resultWaiters = []
  const sessionId = randomUUID()

  function flushResultWaiters() {
    while (resultWaiters.length > 0 && resultCount >= resultWaiters[0].target) {
      resultWaiters.shift().resolve()
    }
  }

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    stdoutBuffer += chunk
    let newlineIndex = stdoutBuffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim()
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
      if (line) {
        const parsed = JSON.parse(line)
        stdoutMessages.push(parsed)
        if (parsed.type === 'result') {
          resultCount += 1
          flushResultWaiters()
        }
      }
      newlineIndex = stdoutBuffer.indexOf('\n')
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => stderrChunks.push(chunk))

  function waitForResult(target) {
    if (resultCount >= target) return Promise.resolve()
    return new Promise(resolve => resultWaiters.push({ target, resolve }))
  }

  const projectDir = join(claudeDir, 'projects', sanitizePath(cwd))
  const globalConfigPath = join(tempHome, '.claude.json')
  const memoryPath = join(projectDir, sessionId, 'session-memory', 'summary.md')
  const transcriptPath = join(projectDir, `${sessionId}.jsonl`)

  async function getObservedSessionId() {
    try {
      const globalConfig = JSON.parse(await readFile(globalConfigPath, 'utf8'))
      const projectConfigs = Object.values(globalConfig.projects ?? {})
      const configuredSessionId = projectConfigs
        .map(projectConfig => projectConfig?.lastSessionId)
        .find(candidate => typeof candidate === 'string' && /^[0-9a-f-]{36}$/i.test(candidate))
      if (configuredSessionId) {
        return configuredSessionId
      }
    } catch {}

    try {
      const entries = await readdir(projectDir, { withFileTypes: true })
      const directoryIds = entries
        .filter(entry => entry.isDirectory() && /^[0-9a-f-]{36}$/i.test(entry.name))
        .map(entry => entry.name)

      const directoriesWithSummary = []
      for (const directoryId of directoryIds) {
        const summaryPath = join(projectDir, directoryId, 'session-memory', 'summary.md')
        try {
          const summaryStats = await stat(summaryPath)
          if (summaryStats.isFile()) {
            directoriesWithSummary.push({
              sessionId: directoryId,
              mtimeMs: summaryStats.mtimeMs,
            })
          }
        } catch {}
      }
      if (directoriesWithSummary.length > 0) {
        directoriesWithSummary.sort((left, right) => right.mtimeMs - left.mtimeMs)
        return directoriesWithSummary[0].sessionId
      }
      if (directoryIds.length > 0) {
        return directoryIds[0]
      }

      const transcriptIds = entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
        .map(entry => entry.name.slice(0, -'.jsonl'.length))
        .filter(name => /^[0-9a-f-]{36}$/i.test(name))
      if (transcriptIds.length > 0) {
        return transcriptIds[0]
      }
    } catch {}

    const stdoutSessionId =
      stdoutMessages.find(
        message =>
          (typeof message.session_id === 'string' && message.session_id) ||
          (typeof message.sessionId === 'string' && message.sessionId),
      )?.session_id ??
      stdoutMessages.find(
        message =>
          (typeof message.session_id === 'string' && message.session_id) ||
          (typeof message.sessionId === 'string' && message.sessionId),
      )?.sessionId ??
      null
    if (stdoutSessionId) {
      return stdoutSessionId
    }

    return sessionId
  }

  async function getSessionPaths() {
    const activeSessionId = await getObservedSessionId()
    return {
      sessionId: activeSessionId,
      memoryPath: join(projectDir, activeSessionId, 'session-memory', 'summary.md'),
      transcriptPath: join(projectDir, `${activeSessionId}.jsonl`),
      projectDir,
    }
  }
  child.stdin.write(
    JSON.stringify({
      type: 'control_request',
      request_id: 'init-1',
      request: {
        subtype: 'initialize',
        promptSuggestions: false,
      },
    }) + '\n',
  )

  try {
    await mkdir(join(memoryPath, '..'), { recursive: true })

    for (let index = 0; index < queries.length; index += 1) {
      const query = queries[index]
      if (query.beforeSend) {
        const paths = await getSessionPaths()
        await mkdir(join(paths.memoryPath, '..'), { recursive: true })
        await query.beforeSend(paths)
      }
      child.stdin.write(
        JSON.stringify({
          type: 'user',
          session_id: sessionId,
          parent_tool_use_id: null,
          message: { role: 'user', content: query.content },
          uuid: `user-${index + 1}`,
        }) + '\n',
      )
      await Promise.race([
        waitForResult(index + 1),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `query ${index + 1} timed out\nstdout=${stdoutMessages.map(message => JSON.stringify(message)).join('\n')}\nstderr=${stderrChunks.join('')}`,
                ),
              ),
            45000,
          ),
        ),
      ])
      if (query.afterResult) {
        await query.afterResult({
          ...(await getSessionPaths()),
          requestBodies: seenRequestBodies,
          messages: stdoutMessages,
          stderr: stderrChunks.join(''),
        })
      }
    }

    child.stdin.end()
    const [code] = await Promise.race([
      once(child, 'close'),
      new Promise((_, reject) =>
        setTimeout(() => {
          child.kill('SIGKILL')
          reject(
            new Error(
              `session close timed out\nstdout=${stdoutMessages.map(message => JSON.stringify(message)).join('\n')}\nstderr=${stderrChunks.join('')}`,
            ),
          )
        }, 30000),
      ),
    ])

    return {
      code,
      requestBodies: seenRequestBodies,
      messages: stdoutMessages,
      stderr: stderrChunks.join(''),
    }
  } finally {
    for (const socket of sockets) {
      socket.destroy()
    }
    child.kill('SIGKILL')
    await new Promise(resolve => server.close(resolve))
    await rm(tempHome, { recursive: true, force: true })
  }
}

const DONE_RESPONSE = [
  'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"done"}]}}\n\n',
  'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-1"}}\n\n',
  'data: [DONE]\n\n',
]

test('main query injects current session memory into the codex request body', async () => {
  const result = await runSession({
    responseBatches: [DONE_RESPONSE, DONE_RESPONSE],
    queries: [
      {
        content: '先回一句 done。',
      },
      {
        content: '请继续当前工作。',
        async beforeSend({ projectDir, memoryPath }) {
          await writeSessionMemorySummary({
            projectDir,
            memoryPath,
            content: '# Current State\nCarry session memory into the main query\n',
          })
        },
        async afterResult({ requestBodies }) {
          assert.match(
            JSON.stringify(requestBodies[1]),
            /Carry session memory into the main query/,
          )
        },
      },
    ],
  })

  assert.equal(result.code, 0, result.stderr)
})

test('resume-like first compact reuses stored session memory summary', async () => {
  const result = await runSession({
    responseBatches: [
      DONE_RESPONSE,
      DONE_RESPONSE,
      DONE_RESPONSE,
      DONE_RESPONSE,
    ],
    queries: [
      {
        content: '先回一句 done。',
      },
      {
        content: '/compact',
        async beforeSend({ memoryPath, projectDir }) {
          await writeSessionMemorySummary({
            projectDir,
            memoryPath,
            content:
              '# Current State\nResume from stored summary on first compact\n',
            waitForExistingSummary: true,
          })
        },
        async afterResult({ projectDir, stderr }) {
          await new Promise(resolve => setTimeout(resolve, 500))
          const transcriptEntries = await readdir(projectDir, {
            withFileTypes: true,
          })
          const transcriptContents = await Promise.all(
            transcriptEntries
              .filter(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
              .map(entry => readFile(join(projectDir, entry.name), 'utf8')),
          )
          const transcript = transcriptContents.join('\n')
          assert.match(
            transcript,
            /Resume from stored summary on first compact/,
          )
          assert.doesNotMatch(transcript, /Compaction interrupted/)
        },
      },
    ],
  })

  assert.equal(result.code, 0, result.stderr)
})

test('resume-like compact prefers the current resumed session summary over newer project summaries', async () => {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-session-memory-compact-'))
  const originalHome = process.env.HOME
  const originalCodexProvider = process.env.CLAUDE_CODE_USE_CODEX_PROVIDER

  try {
    const cwd = '/home/pxr/workspace/CodingAgent/Codex-Code/upstream/claude-code'
    const projectDir = join(
      tempHome,
      '.claude',
      'projects',
      sanitizePath(cwd),
    )
    await mkdir(projectDir, { recursive: true })
    const resumedSessionId = randomUUID()
    const transcriptPath = join(projectDir, `${resumedSessionId}.jsonl`)
    await writeFile(transcriptPath, '', 'utf8')
    const resumedSummaryPath = join(
      projectDir,
      resumedSessionId,
      'session-memory',
      'summary.md',
    )
    await mkdir(join(resumedSummaryPath, '..'), { recursive: true })
    await writeFile(
      resumedSummaryPath,
      '# Current State\nPrefer the resumed session summary\n',
      'utf8',
    )

    await new Promise(resolve => setTimeout(resolve, 20))
    const fallbackSessionId = randomUUID()
    const fallbackSummaryPath = join(
      projectDir,
      fallbackSessionId,
      'session-memory',
      'summary.md',
    )
    await mkdir(join(fallbackSummaryPath, '..'), { recursive: true })
    await writeFile(
      fallbackSummaryPath,
      '# Current State\nDo not steal from another session\n',
      'utf8',
    )

    const { findSessionMemorySummaryContent } = await import(
      '../src/services/compact/sessionMemorySelection.ts'
    )

    const selectedSummary = await findSessionMemorySummaryContent({
      fs: {
        readFile,
        readdir: async path => readdir(path, { withFileTypes: true }),
        stat,
      },
      projectDir,
      currentSessionMemoryPath: join(
        projectDir,
        basename(transcriptPath, '.jsonl'),
        'session-memory',
        'summary.md',
      ),
      transcriptSessionMemoryPath: resumedSummaryPath,
      isEmpty: async content => content.trim().length === 0,
    })

    assert.equal(
      selectedSummary,
      '# Current State\nPrefer the resumed session summary\n',
    )
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    if (originalCodexProvider === undefined) {
      delete process.env.CLAUDE_CODE_USE_CODEX_PROVIDER
    } else {
      process.env.CLAUDE_CODE_USE_CODEX_PROVIDER = originalCodexProvider
    }
    await rm(tempHome, { recursive: true, force: true })
  }
})

test('session memory writer path does not recurse back through provider injection', async () => {
  const result = await runSession({
    responseBatches: [DONE_RESPONSE, DONE_RESPONSE],
    queries: [
      {
        content: '先回一句 done。',
      },
      {
        content: '请继续当前工作。',
        async beforeSend({ projectDir, memoryPath }) {
          await writeSessionMemorySummary({
            projectDir,
            memoryPath,
            content:
              '# Current State\nDo not inject this into the session memory writer\n',
          })
        },
        async afterResult({ requestBodies }) {
          assert.equal(requestBodies.length, 2)
          assert.match(
            JSON.stringify(requestBodies[1]),
            /Do not inject this into the session memory writer/,
          )
        },
      },
    ],
  })

  assert.equal(result.code, 0, result.stderr)
})

test('querySource session_memory never injects current session memory back into its own writer path', async () => {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-session-memory-module-'))
  const originalHome = process.env.HOME
  const originalCodexProvider = process.env.CLAUDE_CODE_USE_CODEX_PROVIDER

  try {
    process.env.HOME = tempHome
    process.env.CLAUDE_CODE_USE_CODEX_PROVIDER = '1'

    const { getCurrentSessionMemoryContextItems } = await import(
      '../src/services/SessionMemory/sessionMemoryContextRules.ts'
    )

    const content =
      '# Current State\nThis should never loop back into session_memory\n'
    const sessionMemoryItems = await getCurrentSessionMemoryContextItems({
      querySource: 'session_memory',
      content,
      path: '/tmp/session-memory/summary.md',
      isEmpty: async value => value.trim().length === 0,
    })
    const sdkItems = await getCurrentSessionMemoryContextItems({
      querySource: 'sdk',
      content,
      path: '/tmp/session-memory/summary.md',
      isEmpty: async value => value.trim().length === 0,
    })

    assert.equal(sessionMemoryItems.length, 0)
    assert.equal(sdkItems.length, 1)
    assert.match(
      JSON.stringify(sdkItems[0]),
      /This should never loop back into session_memory/,
    )
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    if (originalCodexProvider === undefined) {
      delete process.env.CLAUDE_CODE_USE_CODEX_PROVIDER
    } else {
      process.env.CLAUDE_CODE_USE_CODEX_PROVIDER = originalCodexProvider
    }
    await rm(tempHome, { recursive: true, force: true })
  }
})

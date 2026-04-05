import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { projectRoot } from './helpers/projectRoot.mjs'

const CLI_CWD = projectRoot
const SERIAL_TEST = { concurrency: false }
const DEFAULT_CONFIG_LINES = [
  'model_provider = "test-provider"',
  'model = "gpt-5.1-codex-mini"',
  'model_reasoning_effort = "medium"',
  'response_storage = false',
]

function sanitizePath(value) {
  return value.replace(/[^a-zA-Z0-9]/g, '-')
}

function responseDone() {
  return 'data: [DONE]\n\n'
}

function responseCompleted(id) {
  return (
    'event: response.completed\n' +
    `data: ${JSON.stringify({ type: 'response.completed', response: { id } })}\n\n`
  )
}

async function withResponsesServer(responseBatches, fn) {
  const seenRequestBodies = []
  const seenRequestHeaders = []
  const sockets = new Set()
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
      seenRequestHeaders.push(req.headers)
      seenRequestBodies.push(JSON.parse(body))
      const steps =
        responseBatches[seenRequestBodies.length - 1] ??
        responseBatches.at(-1) ??
        []
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        connection: 'keep-alive',
        'cache-control': 'no-cache',
      })
      for (const step of steps) {
        res.write(step.block)
        if (step.delayMs && step.delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, step.delayMs))
        }
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
    throw new Error('failed to bind test provider server')
  }

  try {
    return await fn({
      port: address.port,
      seenRequestBodies,
      seenRequestHeaders,
    })
  } finally {
    for (const socket of sockets) {
      socket.destroy()
    }
    await new Promise(resolve => server.close(resolve))
  }
}

async function writeCodexConfig(homeDir, port) {
  const codexDir = join(homeDir, '.codex')
  await mkdir(codexDir, { recursive: true })
  await writeFile(
    join(codexDir, 'config.toml'),
    [
      ...DEFAULT_CONFIG_LINES,
      '',
      '[model_providers.test-provider]',
      `base_url = "http://127.0.0.1:${port}"`,
      'env_key = "ANTHROPIC_API_KEY"',
      '',
    ].join('\n'),
  )
}

async function seedSession({
  homeDir,
  projectCwd,
  sessionId,
  userText,
  assistantText,
  summaryText,
  modifiedOffsetMs = 0,
}) {
  const projectDir = join(
    homeDir,
    '.claude',
    'projects',
    sanitizePath(projectCwd),
  )
  await mkdir(projectDir, { recursive: true })
  const transcriptPath = join(projectDir, `${sessionId}.jsonl`)
  const timestamp = new Date(Date.now() + modifiedOffsetMs).toISOString()
  const promptId = randomUUID()
  await writeFile(
    transcriptPath,
    [
      JSON.stringify({
        parentUuid: null,
        isSidechain: false,
        promptId,
        type: 'user',
        message: { role: 'user', content: userText },
        uuid: 'user-1',
        timestamp,
        permissionMode: 'default',
        userType: 'external',
        entrypoint: 'sdk-cli',
        cwd: projectCwd,
        sessionId,
        version: '0.0.0-dev',
        gitBranch: 'main',
      }),
      JSON.stringify({
        parentUuid: 'user-1',
        isSidechain: false,
        type: 'assistant',
        uuid: 'assistant-1',
        timestamp,
        message: {
          id: 'assistant-1',
          container: null,
          model: 'codex-synthetic',
          role: 'assistant',
          stop_reason: 'stop_sequence',
          stop_sequence: '',
          type: 'message',
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
            service_tier: null,
            cache_creation: {
              ephemeral_1h_input_tokens: 0,
              ephemeral_5m_input_tokens: 0,
            },
            inference_geo: null,
            iterations: null,
            speed: null,
          },
          content: [{ type: 'text', text: assistantText }],
          context_management: null,
        },
        modelTurnItems: [
          {
            kind: 'final_answer',
            provider: 'custom',
            text: assistantText,
            source: 'message_output_filtered',
          },
        ],
        userType: 'external',
        entrypoint: 'sdk-cli',
        cwd: projectCwd,
        sessionId,
        version: '0.0.0-dev',
        gitBranch: 'main',
      }),
    ].join('\n') + '\n',
    'utf8',
  )

  const summaryPath = join(projectDir, sessionId, 'session-memory', 'summary.md')
  await mkdir(join(summaryPath, '..'), { recursive: true })
  await writeFile(summaryPath, summaryText, 'utf8')
  const modifiedTime = new Date(Date.now() + modifiedOffsetMs)
  await utimes(transcriptPath, modifiedTime, modifiedTime)
  await utimes(summaryPath, modifiedTime, modifiedTime)

  return {
    transcriptPath,
    summaryPath,
  }
}

async function runNavigationHeadlessSession({
  homeDir,
  currentCwd = CLI_CWD,
  extraArgs,
  afterInitialize,
}) {
  return withResponsesServer([], async serverState => {
    await writeCodexConfig(homeDir, serverState.port)

    const child = spawn(
      'node',
      [
        'dist/cli.js',
        '-p',
        '--bare',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--verbose',
        '--debug-to-stderr',
        ...extraArgs,
      ],
      {
        cwd: currentCwd,
        env: {
          ...process.env,
          HOME: homeDir,
          ANTHROPIC_API_KEY: 'test-key',
          CODEX_CODE_USE_CODEX_PROVIDER: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )

    const stdoutMessages = []
    const stderrChunks = []
    const waiters = []
    let stdoutBuffer = ''
    let childClosed = false

    function flushWaiters() {
      for (let index = waiters.length - 1; index >= 0; index -= 1) {
        const waiter = waiters[index]
        if (stdoutMessages.some(waiter.predicate)) {
          waiters.splice(index, 1)
          waiter.resolve()
        }
      }
    }

    function waitForMessage(predicate) {
      if (stdoutMessages.some(predicate)) {
        return Promise.resolve()
      }
      return new Promise(resolve => waiters.push({ predicate, resolve }))
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
          if (parsed.type === 'result' && !child.stdin.destroyed) {
            child.stdin.end()
          }
          flushWaiters()
        }
        newlineIndex = stdoutBuffer.indexOf('\n')
      }
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => stderrChunks.push(chunk))
    child.on('close', () => {
      childClosed = true
    })

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

    await Promise.race([
      waitForMessage(
        message =>
          message.type === 'control_response' &&
          message.response?.subtype === 'success' &&
          message.response?.request_id === 'init-1',
      ),
      new Promise((_, reject) =>
        setTimeout(
          () => {
            if (!childClosed) {
              child.kill('SIGKILL')
            }
            reject(
              new Error(
                `initialize timed out\nstdout=${stdoutMessages.map(message => JSON.stringify(message)).join('\n')}\nstderr=${stderrChunks.join('')}`,
              ),
            )
          },
          45000,
        ),
      ),
    ])

    if (afterInitialize) {
      await afterInitialize({ child, waitForMessage, stdoutMessages })
    }

    const [code] = await Promise.race([
      once(child, 'close'),
      new Promise((_, reject) =>
        setTimeout(() => {
          if (!childClosed) {
            child.kill('SIGKILL')
          }
          reject(
            new Error(
              `session navigation timed out\nstdout=${stdoutMessages.map(message => JSON.stringify(message)).join('\n')}\nstderr=${stderrChunks.join('')}`,
            ),
          )
        }, 45000),
      ),
    ])

    return {
      code,
      messages: stdoutMessages,
      stderr: stderrChunks.join(''),
      requestBodies: serverState.seenRequestBodies,
      requestHeaders: serverState.seenRequestHeaders,
    }
  })
}

async function runCompactAfterNavigation({
  homeDir,
  currentCwd = CLI_CWD,
  extraArgs,
}) {
  return runNavigationHeadlessSession({
    homeDir,
    currentCwd,
    extraArgs,
    afterInitialize: async ({ child }) => {
      child.stdin.write(
        JSON.stringify({
          type: 'user',
          session_id: randomUUID(),
          parent_tool_use_id: null,
          message: { role: 'user', content: '/compact' },
          uuid: 'user-compact',
        }) + '\n',
      )
    },
  })
}

async function readSessionListFromBuiltModule(homeDir) {
  const scriptPath = join(homeDir, 'session-list-script.mjs')
  const listSessionsModuleUrl = pathToFileURL(
    join(CLI_CWD, 'dist/src/utils/listSessionsImpl.js'),
  ).href
  await writeFile(
    scriptPath,
    [
      `import { listSessionsImpl } from ${JSON.stringify(listSessionsModuleUrl)}`,
      "const logs = await listSessionsImpl({ dir: process.cwd() })",
      "process.stdout.write(JSON.stringify(logs.map(log => ({ sessionId: log.sessionId, firstPrompt: log.firstPrompt, modified: log.lastModified }))))",
    ].join('\n'),
    'utf8',
  )

  const child = spawn('node', [scriptPath], {
    cwd: CLI_CWD,
    env: {
      ...process.env,
      HOME: homeDir,
      ANTHROPIC_API_KEY: 'test-key',
      CODEX_CODE_USE_CODEX_PROVIDER: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

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
  assert.equal(code, 0, stderr)
  return JSON.parse(stdout)
}

test(
  'session navigation: --continue resumes the most recent local session',
  SERIAL_TEST,
  async () => {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-continue-accept-'))
  try {
    const olderSessionId = randomUUID()
    await seedSession({
      homeDir: tempHome,
      projectCwd: CLI_CWD,
      sessionId: olderSessionId,
      userText: 'older prompt',
      assistantText: 'older answer',
      summaryText: '# Current State\nOlder summary\n',
      modifiedOffsetMs: -1000,
    })

    const latestSessionId = randomUUID()
    await seedSession({
      homeDir: tempHome,
      projectCwd: CLI_CWD,
      sessionId: latestSessionId,
      userText: 'latest prompt',
      assistantText: 'latest answer',
      summaryText: '# Current State\nLatest summary\n',
      modifiedOffsetMs: 0,
    })

    const result = await runCompactAfterNavigation({
      homeDir: tempHome,
      extraArgs: ['--continue'],
    })

    assert.equal(result.code, 0, result.stderr)
    const initMessage = result.messages.find(
      message => message.type === 'system' && message.subtype === 'init',
    )
    assert.equal(initMessage?.session_id, latestSessionId)
    const output = result.messages.map(message => JSON.stringify(message)).join('\n')
    assert.match(output, /Latest summary/)
    assert.doesNotMatch(output, /Older summary/)
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
  },
)

test(
  'session navigation: --resume with a session id restores the chosen session',
  SERIAL_TEST,
  async () => {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-resume-id-accept-'))
  try {
    const targetSessionId = randomUUID()
    await seedSession({
      homeDir: tempHome,
      projectCwd: CLI_CWD,
      sessionId: targetSessionId,
      userText: 'target prompt',
      assistantText: 'target answer',
      summaryText: '# Current State\nTarget summary\n',
      modifiedOffsetMs: -1000,
    })

    const distractorSessionId = randomUUID()
    await seedSession({
      homeDir: tempHome,
      projectCwd: CLI_CWD,
      sessionId: distractorSessionId,
      userText: 'newer prompt',
      assistantText: 'newer answer',
      summaryText: '# Current State\nWrong newer summary\n',
      modifiedOffsetMs: 0,
    })

    const result = await runCompactAfterNavigation({
      homeDir: tempHome,
      extraArgs: ['--resume', targetSessionId],
    })

    assert.equal(result.code, 0, result.stderr)
    const initMessage = result.messages.find(
      message => message.type === 'system' && message.subtype === 'init',
    )
    assert.equal(initMessage?.session_id, targetSessionId)
    const output = result.messages.map(message => JSON.stringify(message)).join('\n')
    assert.match(output, /Target summary/)
    assert.doesNotMatch(output, /Wrong newer summary/)
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
  },
)

test(
  'session navigation: --resume with a transcript path restores that transcript',
  SERIAL_TEST,
  async () => {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-resume-path-accept-'))
  try {
    const resumedCwd = join(tempHome, 'resumed-worktree-project')
    await mkdir(resumedCwd, { recursive: true })
    const targetSessionId = randomUUID()
    const seeded = await seedSession({
      homeDir: tempHome,
      projectCwd: resumedCwd,
      sessionId: targetSessionId,
      userText: 'path prompt',
      assistantText: 'path answer',
      summaryText: '# Current State\nTranscript path summary\n',
    })

    await seedSession({
      homeDir: tempHome,
      projectCwd: CLI_CWD,
      sessionId: randomUUID(),
      userText: 'local prompt',
      assistantText: 'local answer',
      summaryText: '# Current State\nWrong local summary\n',
    })

    const result = await runCompactAfterNavigation({
      homeDir: tempHome,
      extraArgs: ['--resume', seeded.transcriptPath],
    })

    assert.equal(result.code, 0, result.stderr)
    const initMessage = result.messages.find(
      message => message.type === 'system' && message.subtype === 'init',
    )
    assert.equal(initMessage?.session_id, targetSessionId)
    const output = result.messages.map(message => JSON.stringify(message)).join('\n')
    assert.match(output, /Transcript path summary/)
    assert.doesNotMatch(output, /Wrong local summary/)
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
  },
)

test(
  'session navigation: session picker data path lists local sessions in newest-first order',
  SERIAL_TEST,
  async () => {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-session-list-accept-'))
  try {
    const firstSessionId = randomUUID()
    await seedSession({
      homeDir: tempHome,
      projectCwd: CLI_CWD,
      sessionId: firstSessionId,
      userText: 'first listed prompt',
      assistantText: 'first listed answer',
      summaryText: '# Current State\nFirst listed summary\n',
      modifiedOffsetMs: -1000,
    })

    const secondSessionId = randomUUID()
    await seedSession({
      homeDir: tempHome,
      projectCwd: CLI_CWD,
      sessionId: secondSessionId,
      userText: 'second listed prompt',
      assistantText: 'second listed answer',
      summaryText: '# Current State\nSecond listed summary\n',
      modifiedOffsetMs: 0,
    })

    const logs = await readSessionListFromBuiltModule(tempHome)
    assert.equal(Array.isArray(logs), true)
    assert.equal(logs.length >= 2, true)
    assert.equal(logs[0]?.sessionId, secondSessionId)
    assert.equal(logs[0]?.firstPrompt, 'second listed prompt')
    assert.equal(logs[1]?.sessionId, firstSessionId)
    assert.equal(logs[1]?.firstPrompt, 'first listed prompt')
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
  },
)

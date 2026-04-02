import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import test from 'node:test'

const CLI_CWD = '/home/pxr/workspace/CodingAgent/Codex-Code/upstream/claude-code'
const CLI_PATH = join(CLI_CWD, 'dist/cli.js')
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

function responseDoneItem(item) {
  return (
    'event: response.output_item.done\n' +
    `data: ${JSON.stringify({ type: 'response.output_item.done', item })}\n\n`
  )
}

function responseCompleted(id) {
  return (
    'event: response.completed\n' +
    `data: ${JSON.stringify({ type: 'response.completed', response: { id } })}\n\n`
  )
}

function responseDone() {
  return 'data: [DONE]\n\n'
}

async function withResponsesServer(responseBatches, fn) {
  const requestBodies = []
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
      requestBodies.push(JSON.parse(body))
      const batch =
        responseBatches[requestBodies.length - 1] ?? responseBatches.at(-1) ?? []
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
    throw new Error('failed to bind slash command acceptance server')
  }

  try {
    return await fn({ port: address.port, requestBodies })
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
    'utf8',
  )
}

async function runTuiFlow({ tempHome, actions, extraArgs = [], extraEnv = {} }) {
  const pythonScript = String.raw`
import json
import os
import pty
import re
import select
import signal
import subprocess
import sys
import time

cli_path, cwd, temp_home, actions_json, extra_args_json, extra_env_json = sys.argv[1:7]
actions = json.loads(actions_json)
extra_env = json.loads(extra_env_json)
master, slave = pty.openpty()
env = os.environ.copy()
env["HOME"] = temp_home
env["ANTHROPIC_API_KEY"] = env.get("ANTHROPIC_API_KEY", "test-key")
env["TERM"] = "xterm-256color"
env["CLAUDE_CODE_DISABLE_TERMINAL_TITLE"] = "1"
env["FORCE_COLOR"] = "0"
env["DISABLE_AUTOUPDATER"] = "1"
env.update(extra_env)
proc = subprocess.Popen(
    ["node", cli_path, "--bare", *json.loads(extra_args_json)],
    cwd=cwd,
    env=env,
    stdin=slave,
    stdout=slave,
    stderr=slave,
    close_fds=True,
)
os.close(slave)
ansi_re = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\].*?(?:\x07|\x1b\\)")
buffer = b""
sent = []
timeout_at = time.time() + 60

while time.time() < timeout_at:
    if proc.poll() is not None:
        break
    ready, _, _ = select.select([master], [], [], 0.1)
    if ready:
        try:
            chunk = os.read(master, 65536)
        except OSError:
            break
        if not chunk:
            break
        buffer += chunk
        clean = ansi_re.sub("", buffer.decode("utf-8", "ignore"))
        normalized = re.sub(r"\s+", "", clean)
        for action in actions:
            if action["name"] in sent:
                continue
            wait_for = action.get("waitFor", [])
            if all(re.sub(r"\s+", "", token) in normalized for token in wait_for):
                pre_delay_ms = action.get("preDelayMs", 0)
                if pre_delay_ms > 0:
                    time.sleep(pre_delay_ms / 1000.0)
                if "sendParts" in action:
                    delay_ms = action.get("delayMs", 100)
                    for part in action["sendParts"]:
                        os.write(master, part.encode("utf-8"))
                        time.sleep(delay_ms / 1000.0)
                else:
                    os.write(master, action["send"].encode("utf-8"))
                sent.append(action["name"])
                if len(sent) == len(actions):
                    settle_ms = action.get("settleMs", 500)
                    if settle_ms > 0:
                        time.sleep(settle_ms / 1000.0)
                    timeout_at = time.time()
                break

if proc.poll() is None:
    proc.send_signal(signal.SIGTERM)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)

clean = ansi_re.sub("", buffer.decode("utf-8", "ignore"))
print(json.dumps({
    "code": proc.returncode,
    "sent": sent,
    "cleanedTranscript": clean,
    "normalizedTranscript": re.sub(r"\s+", "", clean),
}))
`

  const child = spawn(
    'python3',
    [
      '-c',
      pythonScript,
      CLI_PATH,
      CLI_CWD,
      tempHome,
      JSON.stringify(actions),
      JSON.stringify(extraArgs),
      JSON.stringify(extraEnv),
    ],
    {
      cwd: CLI_CWD,
      env: process.env,
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

  const [code] = await Promise.race([
    once(child, 'close'),
    new Promise((_, reject) => {
      setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`slash command TUI timed out\nstdout=${stdout}\nstderr=${stderr}`))
      }, 65000)
    }),
  ])

  if (!stdout.trim()) {
    throw new Error(stderr || `python TUI driver exited with ${code}`)
  }
  return JSON.parse(stdout)
}

async function runStructuredHeadlessSession({
  tempHome,
  currentCwd = CLI_CWD,
  extraArgs = [],
  initialMessages = [],
}) {
  const stdoutMessages = []
  const stderrChunks = []
  let stdoutBuffer = ''
  let resultCount = 0
  const resultWaiters = []
  const messageWaiters = []

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
      ...extraArgs,
    ],
    {
      cwd: currentCwd,
      env: {
        ...process.env,
        HOME: tempHome,
        ANTHROPIC_API_KEY: 'test-key',
        CLAUDE_CODE_USE_CODEX_PROVIDER: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )

  function flushResultWaiters() {
    while (resultWaiters.length > 0 && resultCount >= resultWaiters[0].target) {
      resultWaiters.shift().resolve()
    }
  }

  function flushMessageWaiters() {
    for (let index = messageWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = messageWaiters[index]
      if (stdoutMessages.some(waiter.predicate)) {
        messageWaiters.splice(index, 1)
        waiter.resolve()
      }
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
        flushMessageWaiters()
      }
      newlineIndex = stdoutBuffer.indexOf('\n')
    }
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => stderrChunks.push(chunk))

  function waitForResult(target) {
    if (resultCount >= target) {
      return Promise.resolve()
    }
    return new Promise(resolve => resultWaiters.push({ target, resolve }))
  }

  function waitForMessage(predicate) {
    if (stdoutMessages.some(predicate)) {
      return Promise.resolve()
    }
    return new Promise(resolve => messageWaiters.push({ predicate, resolve }))
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

  await Promise.race([
    waitForMessage(
      message =>
        message.type === 'control_response' &&
        message.response?.subtype === 'success' &&
        message.response?.request_id === 'init-1',
    ),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('initialize timed out')), 45000),
    ),
  ])

  for (const message of initialMessages) {
    child.stdin.write(JSON.stringify(message) + '\n')
  }

  return {
    child,
    stdoutMessages,
    stderrChunks,
    waitForResult,
    waitForMessage,
  }
}

async function closeHeadlessSession(session) {
  const { child, stdoutMessages, stderrChunks } = session
  if (!child.stdin.destroyed) {
    child.stdin.end()
  }
  const [code] = await Promise.race([
    once(child, 'close'),
    new Promise((_, reject) =>
      setTimeout(() => {
        child.kill('SIGKILL')
        reject(
          new Error(
            `headless close timed out\nstdout=${stdoutMessages.map(message => JSON.stringify(message)).join('\n')}\nstderr=${stderrChunks.join('')}`,
          ),
        )
      }, 30000),
    ),
  ])
  return {
    code,
    messages: stdoutMessages,
    stderr: stderrChunks.join(''),
  }
}

async function seedResumedSession({
  homeDir,
  resumedCwd,
  currentCwd,
}) {
  const resumedSessionId = randomUUID()
  const resumedProjectDir = join(
    homeDir,
    '.claude',
    'projects',
    sanitizePath(resumedCwd),
  )
  const currentProjectDir = join(
    homeDir,
    '.claude',
    'projects',
    sanitizePath(currentCwd),
  )

  await mkdir(resumedProjectDir, { recursive: true })
  await mkdir(currentProjectDir, { recursive: true })

  const transcriptPath = join(resumedProjectDir, `${resumedSessionId}.jsonl`)
  const timestamp = new Date().toISOString()

  await writeFile(
    transcriptPath,
    [
      JSON.stringify({
        parentUuid: null,
        isSidechain: false,
        promptId: randomUUID(),
        type: 'user',
        message: { role: 'user', content: 'resume me for compact' },
        uuid: 'user-1',
        timestamp,
        permissionMode: 'default',
        userType: 'external',
        entrypoint: 'sdk-cli',
        cwd: resumedCwd,
        sessionId: resumedSessionId,
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
          content: [{ type: 'text', text: 'done' }],
          context_management: null,
        },
        modelTurnItems: [
          {
            kind: 'final_answer',
            provider: 'custom',
            text: 'done',
            source: 'message_output_filtered',
          },
        ],
        userType: 'external',
        entrypoint: 'sdk-cli',
        cwd: resumedCwd,
        sessionId: resumedSessionId,
        version: '0.0.0-dev',
        gitBranch: 'main',
      }),
    ].join('\n') + '\n',
    'utf8',
  )

  const resumedSummaryPath = join(
    resumedProjectDir,
    resumedSessionId,
    'session-memory',
    'summary.md',
  )
  await mkdir(join(resumedSummaryPath, '..'), { recursive: true })
  await writeFile(
    resumedSummaryPath,
    '# Current State\nPrefer the resumed worktree summary\n',
    'utf8',
  )

  const wrongSummaryPath = join(
    currentProjectDir,
    randomUUID(),
    'session-memory',
    'summary.md',
  )
  await mkdir(join(wrongSummaryPath, '..'), { recursive: true })
  await writeFile(
    wrongSummaryPath,
    '# Current State\nWrong current cwd project summary\n',
    'utf8',
  )

  const staleTime = new Date(Date.now() - 1000)
  await utimes(transcriptPath, staleTime, staleTime)
  await utimes(resumedSummaryPath, staleTime, staleTime)

  return { transcriptPath, resumedSessionId }
}

async function seedResumedSessionWithPlan({
  homeDir,
  resumedCwd,
  currentCwd,
}) {
  const planSlug = 'resume-plan-smoke'
  const seeded = await seedResumedSession({
    homeDir,
    resumedCwd,
    currentCwd,
  })
  const resumedProjectDir = join(
    homeDir,
    '.claude',
    'projects',
    sanitizePath(resumedCwd),
  )
  const timestamp = new Date().toISOString()
  await writeFile(
    seeded.transcriptPath,
    [
      JSON.stringify({
        parentUuid: null,
        isSidechain: false,
        promptId: randomUUID(),
        type: 'user',
        message: { role: 'user', content: 'resume me for plan' },
        uuid: 'plan-user-1',
        timestamp,
        permissionMode: 'default',
        userType: 'external',
        entrypoint: 'sdk-cli',
        cwd: resumedCwd,
        sessionId: seeded.resumedSessionId,
        version: '0.0.0-dev',
        gitBranch: 'main',
        slug: planSlug,
      }),
      JSON.stringify({
        parentUuid: 'plan-user-1',
        isSidechain: false,
        type: 'assistant',
        uuid: 'plan-assistant-1',
        timestamp,
        message: {
          id: 'plan-assistant-1',
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
          content: [{ type: 'text', text: 'plan ready' }],
          context_management: null,
        },
        modelTurnItems: [
          {
            kind: 'final_answer',
            provider: 'custom',
            text: 'plan ready',
            source: 'message_output_filtered',
          },
        ],
        userType: 'external',
        entrypoint: 'sdk-cli',
        cwd: resumedCwd,
        sessionId: seeded.resumedSessionId,
        version: '0.0.0-dev',
        gitBranch: 'main',
      }),
    ].join('\n') + '\n',
    'utf8',
  )

  const plansDir = join(homeDir, '.claude', 'plans')
  await mkdir(plansDir, { recursive: true })
  await writeFile(
    join(plansDir, `${planSlug}.md`),
    'Plan from resumed session\n- Step A\n- Step B\n',
    'utf8',
  )

  // Keep existing summary files stale to avoid affecting plan assertions.
  const staleTime = new Date(Date.now() - 1000)
  await utimes(join(resumedProjectDir, `${seeded.resumedSessionId}.jsonl`), staleTime, staleTime)

  return seeded
}

test('/help TUI: opens built-in help, shows core help content, and Esc closes it', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-help-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'open-help', waitFor: ['❯'], send: '/help\r' },
          {
            name: 'dismiss-help',
            waitFor: ['For more help:', 'esc to cancel', 'commands', 'custom-commands'],
            send: '\u001b',
          },
          {
            name: 'exit',
            waitFor: ['Help dialog dismissed'],
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['open-help', 'dismiss-help', 'exit'])
      assert.match(result.normalizedTranscript, /Formorehelp:/)
      assert.match(result.normalizedTranscript, /commands/)
      assert.match(result.normalizedTranscript, /custom-commands/)
      assert.match(result.normalizedTranscript, /esctocancel/)
      assert.match(result.normalizedTranscript, /Helpdialogdismissed/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/plan TUI: enables plan mode and then reports empty current plan without provider traffic', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-plan-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'open-plan', waitFor: ['❯'], send: '/plan\r' },
          {
            name: 'show-plan-status',
            waitFor: ['Enabled plan mode'],
            send: '/plan\r',
          },
          {
            name: 'exit',
            waitFor: ['Already in plan mode. No plan written yet.'],
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['open-plan', 'show-plan-status', 'exit'])
      assert.match(result.normalizedTranscript, /Enabledplanmode/)
      assert.match(result.normalizedTranscript, /Alreadyinplanmode\.Noplanwrittenyet\./)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test.skip('/plan TUI: resume restores existing plan content, allows re-enter status, then exits (blocked by plan-slug restore timing/association)', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-plan-resume-tui-'))
    const resumedCwd = join(CLI_CWD, '..')
    try {
      await writeCodexConfig(tempHome, port)
      const { transcriptPath } = await seedResumedSessionWithPlan({
        homeDir: tempHome,
        resumedCwd,
        currentCwd: CLI_CWD,
      })

      const result = await runTuiFlow({
        tempHome,
        extraArgs: ['--resume', transcriptPath],
        actions: [
          // Resume restores plan slug asynchronously; a short delay keeps this deterministic.
          { name: 'enter-plan', waitFor: ['❯'], preDelayMs: 1500, send: '/plan\r' },
          {
            name: 'show-existing-plan',
            waitFor: ['Enabled plan mode'],
            send: '/plan\r',
          },
          {
            name: 'exit',
            waitFor: ['Current Plan', 'Plan from resumed session'],
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, [
        'enter-plan',
        'show-existing-plan',
        'exit',
      ])
      assert.match(result.normalizedTranscript, /Enabledplanmode/)
      assert.match(result.normalizedTranscript, /CurrentPlan/)
      assert.match(result.normalizedTranscript, /Planfromresumedsession/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/config TUI: opens settings dialog and Esc closes it without provider traffic', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-config-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'open-config', waitFor: ['❯'], send: '/config\r' },
          {
            name: 'dismiss-config',
            waitFor: ['/config'],
            preDelayMs: 1200,
            send: '\u001b',
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['open-config', 'dismiss-config'])
      assert.match(result.normalizedTranscript, /\/config/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/diff TUI: opens diff dialog and Esc closes it without provider traffic', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-diff-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'open-diff', waitFor: ['❯'], send: '/diff\r' },
          {
            name: 'dismiss-diff',
            waitFor: ['/diff'],
            preDelayMs: 1200,
            send: '\u001b',
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['open-diff', 'dismiss-diff'])
      assert.match(result.normalizedTranscript, /\/diff/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/doctor TUI: opens diagnostics and Esc closes it without provider traffic', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-doctor-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'open-doctor', waitFor: ['❯'], send: '/doctor\r' },
          {
            name: 'dismiss-doctor',
            waitFor: ['/doctor'],
            preDelayMs: 1200,
            send: '\u001b',
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['open-doctor', 'dismiss-doctor'])
      assert.match(result.normalizedTranscript, /\/doctor/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/add-dir TUI: opens add-directory flow, Esc cancels, and stays local-only', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-add-dir-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'open-add-dir', waitFor: ['❯'], send: '/add-dir\r' },
          {
            name: 'cancel-add-dir',
            waitFor: ['Enter the path to the directory:'],
            send: '\u001b',
          },
          {
            name: 'exit',
            waitFor: ['Did not add a working directory.'],
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['open-add-dir', 'cancel-add-dir', 'exit'])
      assert.match(result.normalizedTranscript, /\/add-dir/)
      assert.match(result.normalizedTranscript, /Didnotaddaworkingdirectory\./)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/branch TUI: branches a resumed local transcript without provider traffic', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-branch-tui-'))
    const resumedCwd = join(CLI_CWD, '..')
    try {
      await writeCodexConfig(tempHome, port)
      const { transcriptPath } = await seedResumedSession({
        homeDir: tempHome,
        resumedCwd,
        currentCwd: CLI_CWD,
      })

      const result = await runTuiFlow({
        tempHome,
        extraArgs: ['--resume', transcriptPath],
        actions: [
          { name: 'run-branch', waitFor: ['❯'], send: '/branch\r' },
          {
            name: 'exit',
            waitFor: ['You are now in the branch.'],
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['run-branch', 'exit'])
      assert.match(result.normalizedTranscript, /Branchedconversation/)
      assert.match(result.normalizedTranscript, /Youarenowinthebranch\./)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/files TUI: accepts the slash command input and exits without provider traffic', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-files-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'run-files', waitFor: ['❯'], send: '/files\r' },
          {
            name: 'exit',
            waitFor: ['/files'],
            preDelayMs: 700,
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['run-files', 'exit'])
      assert.match(result.normalizedTranscript, /\/files/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/hooks TUI: accepts the slash command input and exits without provider traffic', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-hooks-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'run-hooks', waitFor: ['❯'], send: '/hooks\r' },
          {
            name: 'exit',
            waitFor: ['/hooks'],
            preDelayMs: 700,
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['run-hooks', 'exit'])
      assert.match(result.normalizedTranscript, /\/hooks/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/keybindings TUI: accepts the slash command input and exits without provider traffic', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-keybindings-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'run-keybindings', waitFor: ['❯'], send: '/keybindings\r' },
          {
            name: 'exit',
            waitFor: ['/keybindings'],
            preDelayMs: 700,
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['run-keybindings', 'exit'])
      assert.match(result.normalizedTranscript, /\/keybindings/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/mcp TUI: accepts the slash command input and exits without provider traffic', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-mcp-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'run-mcp', waitFor: ['❯'], send: '/mcp\r' },
          {
            name: 'exit',
            waitFor: ['/mcp'],
            preDelayMs: 700,
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['run-mcp', 'exit'])
      assert.match(result.normalizedTranscript, /\/mcp/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/rewind TUI: accepts command input locally without provider traffic', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-rewind-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'open-rewind', waitFor: ['❯'], send: '/rewind\r' },
          {
            name: 'exit',
            waitFor: ['/rewind'],
            preDelayMs: 700,
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['open-rewind', 'exit'])
      assert.match(result.normalizedTranscript, /\/rewind/)
      assert.doesNotMatch(result.normalizedTranscript, /Unknownskill:rewind/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/skills TUI: opens skills dialog, Esc closes it, and stays local-only', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-skills-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'open-skills', waitFor: ['❯'], send: '/skills\r' },
          {
            name: 'dismiss-skills',
            waitFor: ['Skills'],
            preDelayMs: 700,
            send: '\u001b',
          },
          {
            name: 'exit',
            waitFor: ['Skills dialog dismissed'],
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['open-skills', 'dismiss-skills', 'exit'])
      assert.match(result.normalizedTranscript, /\/skills/)
      assert.match(result.normalizedTranscript, /Skillsdialogdismissed/)
      assert.doesNotMatch(result.normalizedTranscript, /Unknownskill:skills/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/tasks TUI: opens background tasks dialog, Esc closes it, and stays local-only', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-tasks-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'open-tasks', waitFor: ['❯'], send: '/tasks\r' },
          {
            name: 'dismiss-tasks',
            waitFor: ['Background tasks'],
            preDelayMs: 700,
            send: '\u001b',
          },
          {
            name: 'exit',
            waitFor: ['Background tasks dialog dismissed'],
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['open-tasks', 'dismiss-tasks', 'exit'])
      assert.match(result.normalizedTranscript, /\/tasks/)
      assert.match(result.normalizedTranscript, /Backgroundtasksdialogdismissed/)
      assert.doesNotMatch(result.normalizedTranscript, /Unknownskill:tasks/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/agents TUI: accepts command locally and exits without provider traffic', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-agents-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'open-agents', waitFor: ['❯'], send: '/agents\r' },
          {
            name: 'exit',
            waitFor: ['/agents'],
            preDelayMs: 1000,
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['open-agents', 'exit'])
      assert.match(result.normalizedTranscript, /\/agents/)
      assert.doesNotMatch(result.normalizedTranscript, /Unknownskill:agents/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/plugin TUI: accepts command locally and exits without provider traffic', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-plugin-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'open-plugin', waitFor: ['❯'], send: '/plugin\r' },
          {
            name: 'exit',
            waitFor: ['/plugin'],
            preDelayMs: 1400,
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['open-plugin', 'exit'])
      assert.match(result.normalizedTranscript, /\/plugin/)
      assert.doesNotMatch(result.normalizedTranscript, /Unknownskill:plugin/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/reload-plugins TUI: reloads plugin state locally without provider traffic', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-reload-plugins-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          {
            name: 'run-reload-plugins',
            waitFor: ['❯'],
            send: '/reload-plugins\r',
          },
          {
            name: 'exit',
            waitFor: ['Reloaded:'],
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['run-reload-plugins', 'exit'])
      assert.match(result.normalizedTranscript, /\/reload-plugins/)
      assert.match(result.normalizedTranscript, /Reloaded:/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/ide TUI: accepts IDE command locally and exits without provider traffic', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-ide-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'open-ide', waitFor: ['❯'], send: '/ide\r' },
          {
            name: 'exit',
            waitFor: ['/ide'],
            preDelayMs: 1000,
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['open-ide', 'exit'])
      assert.match(result.normalizedTranscript, /\/ide/)
      assert.doesNotMatch(result.normalizedTranscript, /Unknownskill:ide/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/session TUI: rejects in non-remote mode as a local unknown-skill path without provider traffic', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-session-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'run-session', waitFor: ['❯'], send: '/session\r' },
          {
            name: 'exit',
            waitFor: ['Unknown skill: session'],
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['run-session', 'exit'])
      assert.match(result.normalizedTranscript, /\/session/)
      assert.match(result.normalizedTranscript, /Unknownskill:session/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/summary TUI: rejects as local unknown-skill path without provider traffic', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-summary-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'run-summary', waitFor: ['❯'], send: '/summary\r' },
          {
            name: 'exit',
            waitFor: ['Unknown skill: summary'],
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['run-summary', 'exit'])
      assert.match(result.normalizedTranscript, /\/summary/)
      assert.match(result.normalizedTranscript, /Unknownskill:summary/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/terminal-setup TUI: shows local setup guidance and stays provider-free', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-terminal-setup-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          {
            name: 'run-terminal-setup',
            waitFor: ['❯'],
            send: '/terminal-setup\r',
          },
          {
            name: 'exit',
            waitFor: ['Terminal setup cannot be run from'],
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['run-terminal-setup', 'exit'])
      assert.match(result.normalizedTranscript, /\/terminal-setup/)
      assert.match(result.normalizedTranscript, /Terminalsetupcannotberunfrom/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('/compact TUI: resume compacts locally, returns to input, and the next prompt uses the resumed summary', SERIAL_TEST, async () => {
  await withResponsesServer(
    [[
      responseDoneItem({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'after compact answer' }],
      }),
      responseCompleted('resp-after-compact'),
      responseDone(),
    ]],
    async ({ port, requestBodies }) => {
      const tempHome = await mkdtemp(join(tmpdir(), 'codex-compact-tui-'))
      const resumedCwd = join(CLI_CWD, '..')
      try {
        await writeCodexConfig(tempHome, port)
        const { transcriptPath } = await seedResumedSession({
          homeDir: tempHome,
          resumedCwd,
          currentCwd: CLI_CWD,
        })

        const result = await runTuiFlow({
          tempHome,
          extraArgs: ['--resume', transcriptPath],
          actions: [
            { name: 'run-compact', waitFor: ['❯'], send: '/compact\r' },
            {
              name: 'ask-after-compact',
              waitFor: ['Compacted'],
              send: 'what summary is loaded?\r',
            },
            {
              name: 'exit',
              waitFor: ['after compact answer'],
              send: '/exit\r',
              settleMs: 800,
            },
          ],
        })

        assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
        assert.deepEqual(
          result.sent,
          ['run-compact', 'ask-after-compact', 'exit'],
          JSON.stringify(result),
        )
        assert.match(result.normalizedTranscript, /Compacted/)
        assert.match(result.normalizedTranscript, /aftercompactanswer/)
        assert.equal(requestBodies.length, 1)
        const requestBodyText = JSON.stringify(requestBodies[0])
        assert.match(requestBodyText, /Prefer the resumed worktree summary/)
        assert.doesNotMatch(requestBodyText, /Wrong current cwd project summary/)
      } finally {
        await rm(tempHome, { recursive: true, force: true })
      }
    },
  )
})

test('/clear headless: clears the session non-interactively and accepts a fresh prompt afterward', SERIAL_TEST, async () => {
  await withResponsesServer(
    [
      [
        responseDoneItem({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'first answer' }],
        }),
        responseCompleted('resp-clear-1'),
        responseDone(),
      ],
      [
        responseDoneItem({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'second answer' }],
        }),
        responseCompleted('resp-clear-2'),
        responseDone(),
      ],
    ],
    async ({ port, requestBodies }) => {
      const tempHome = await mkdtemp(join(tmpdir(), 'codex-clear-headless-'))
      try {
        await writeCodexConfig(tempHome, port)
        const session = await runStructuredHeadlessSession({ tempHome })
        const sessionId = randomUUID()

        session.child.stdin.write(
          JSON.stringify({
            type: 'user',
            session_id: sessionId,
            parent_tool_use_id: null,
            message: { role: 'user', content: 'first prompt before clear' },
            uuid: 'user-before-clear',
          }) + '\n',
        )
        await session.waitForResult(1)

        session.child.stdin.write(
          JSON.stringify({
            type: 'user',
            session_id: sessionId,
            parent_tool_use_id: null,
            message: { role: 'user', content: '/clear' },
            uuid: 'user-clear',
          }) + '\n',
        )
        await session.waitForResult(2)

        session.child.stdin.write(
          JSON.stringify({
            type: 'user',
            session_id: sessionId,
            parent_tool_use_id: null,
            message: { role: 'user', content: 'second prompt after clear' },
            uuid: 'user-after-clear',
          }) + '\n',
        )
        await session.waitForResult(3)

        const result = await closeHeadlessSession(session)
        assert.equal(result.code, 0, result.stderr)
        assert.equal(requestBodies.length, 2)
        assert.match(JSON.stringify(requestBodies[0] ?? {}), /first prompt before clear/)
        assert.match(JSON.stringify(requestBodies[1] ?? {}), /second prompt after clear/)
        assert.doesNotMatch(
          JSON.stringify(requestBodies[1] ?? {}),
          /first prompt before clear/,
        )

        const transcriptOutput = result.messages
          .map(message => JSON.stringify(message))
          .join('\n')
        assert.doesNotMatch(transcriptOutput, /Unknown skill: clear/)

        const projectDir = join(
          tempHome,
          '.claude',
          'projects',
          sanitizePath(CLI_CWD),
        )
        const transcriptEntries = await readdir(projectDir, { withFileTypes: true })
        const transcriptFiles = transcriptEntries
          .filter(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
          .sort((a, b) => a.name.localeCompare(b.name))

        assert.ok(
          transcriptFiles.length >= 1,
          transcriptFiles.map(file => file.name).join(','),
        )

        const newestTranscript = await readFile(
          join(projectDir, transcriptFiles.at(-1).name),
          'utf8',
        )
        assert.match(newestTranscript, /second prompt after clear/)
        assert.match(newestTranscript, /second answer/)
      } finally {
        await rm(tempHome, { recursive: true, force: true })
      }
    },
  )
})

test('/compact headless: resume prefers the resumed transcript summary over the current cwd project summary', SERIAL_TEST, async () => {
  await withResponsesServer([], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-compact-headless-'))
    const resumedCwd = join(CLI_CWD, '..')
    try {
      await writeCodexConfig(tempHome, port)
      const { transcriptPath } = await seedResumedSession({
        homeDir: tempHome,
        resumedCwd,
        currentCwd: CLI_CWD,
      })

      const session = await runStructuredHeadlessSession({
        tempHome,
        currentCwd: CLI_CWD,
        extraArgs: ['--resume', transcriptPath],
      })

      session.child.stdin.write(
        JSON.stringify({
          type: 'user',
          session_id: randomUUID(),
          parent_tool_use_id: null,
          message: { role: 'user', content: '/compact' },
          uuid: 'user-compact',
        }) + '\n',
      )

      await session.waitForResult(1)
      const result = await closeHeadlessSession(session)

      assert.equal(result.code, 0, result.stderr)
      assert.equal(requestBodies.length, 0)
      const transcriptOutput = result.messages
        .map(message => JSON.stringify(message))
        .join('\n')
      assert.match(transcriptOutput, /Prefer the resumed worktree summary/)
      assert.doesNotMatch(transcriptOutput, /Wrong current cwd project summary/)
      assert.match(transcriptOutput, /Compacted/)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

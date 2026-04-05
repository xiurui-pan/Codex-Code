import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { projectRoot } from './helpers/projectRoot.mjs'

const CLI_CWD = projectRoot
const CLI_PATH = join(CLI_CWD, 'dist/cli.js')
const DEFAULT_CONFIG_LINES = [
  'model_provider = "test-provider"',
  'model = "gpt-5.1-codex-mini"',
  'model_reasoning_effort = "medium"',
  'response_storage = false',
]

function sanitizePath(value) {
  return value.replace(/[^a-zA-Z0-9]/g, '-')
}

async function withResponsesServer(fn) {
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
    req.on('end', () => {
      requestBodies.push(JSON.parse(body))
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        connection: 'keep-alive',
        'cache-control': 'no-cache',
      })
      res.write(
        `event: response.output_item.done\ndata: ${JSON.stringify({
          type: 'response.output_item.done',
          item: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'UNEXPECTED_PROVIDER_REPLY' }],
          },
        })}\n\n`,
      )
      res.write(
        `event: response.completed\ndata: ${JSON.stringify({
          type: 'response.completed',
          response: { id: 'resp-session-nav-tui-1' },
        })}\n\n`,
      )
      res.write('data: [DONE]\n\n')
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
    throw new Error('failed to bind TUI test provider server')
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

async function seedSession({
  homeDir,
  projectCwd,
  sessionId,
  userText,
  assistantText,
  summaryText,
  modifiedOffsetMs = 0,
}) {
  const projectDir = join(homeDir, '.claude', 'projects', sanitizePath(projectCwd))
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
}

async function runTuiNavigationFlow({ tempHome, actions }) {
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

cli_path, cwd, temp_home, actions_json = sys.argv[1:5]
actions = json.loads(actions_json)
master, slave = pty.openpty()
env = os.environ.copy()
env["HOME"] = temp_home
if "ANTHROPIC_API_KEY" not in env:
    env["ANTHROPIC_API_KEY"] = "test-key"
env["TERM"] = "xterm-256color"
env["CODEX_CODE_DISABLE_TERMINAL_TITLE"] = "1"
env["FORCE_COLOR"] = "0"
proc = subprocess.Popen(
    ["node", cli_path, "--bare"],
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
    ['-c', pythonScript, CLI_PATH, CLI_CWD, tempHome, JSON.stringify(actions)],
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
        reject(
          new Error(`session navigation TUI timed out\nstdout=${stdout}\nstderr=${stderr}`),
        )
      }, 65000)
    }),
  ])

  if (!stdout.trim()) {
    throw new Error(stderr || `python TUI driver exited with ${code}`)
  }
  return JSON.parse(stdout)
}

test('session navigation TUI: /resume picker lists sessions and enter confirms the highlighted session', async () => {
  await withResponsesServer(async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-session-nav-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      await seedSession({
        homeDir: tempHome,
        projectCwd: CLI_CWD,
        sessionId: randomUUID(),
        userText: 'first listed prompt',
        assistantText: 'first listed answer',
        summaryText: '# Current State\nFirst listed summary\n',
        modifiedOffsetMs: -1000,
      })
      await seedSession({
        homeDir: tempHome,
        projectCwd: CLI_CWD,
        sessionId: randomUUID(),
        userText: 'second listed prompt',
        assistantText: 'second listed answer',
        summaryText: '# Current State\nSecond listed summary\n',
        modifiedOffsetMs: 0,
      })

      const result = await runTuiNavigationFlow({
        tempHome,
        actions: [
          { name: 'open-resume', waitFor: ['❯'], send: '/resume\r' },
          {
            name: 'confirm-default-selection',
            waitFor: ['first listed prompt', 'second listed prompt'],
            sendParts: ['\r', '\r'],
            delayMs: 120,
          },
          {
            name: 'exit-after-selection',
            waitFor: ['second listed answer'],
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, [
        'open-resume',
        'confirm-default-selection',
        'exit-after-selection',
      ])
      assert.match(result.normalizedTranscript, /firstlistedprompt/)
      assert.match(result.normalizedTranscript, /secondlistedprompt/)
      assert.match(result.normalizedTranscript, /secondlistedanswer/)
      assert.ok(requestBodies.length === 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('session navigation TUI: /resume picker supports Esc cancel and returns to the prompt', async () => {
  await withResponsesServer(async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-session-nav-tui-cancel-'))
    try {
      await writeCodexConfig(tempHome, port)
      await seedSession({
        homeDir: tempHome,
        projectCwd: CLI_CWD,
        sessionId: randomUUID(),
        userText: 'cancel listed prompt',
        assistantText: 'cancel listed answer',
        summaryText: '# Current State\nCancel listed summary\n',
      })

      const result = await runTuiNavigationFlow({
        tempHome,
        actions: [
          { name: 'open-resume', waitFor: ['❯'], send: '/resume\r' },
          {
            name: 'move-then-cancel',
            waitFor: ['cancel listed prompt'],
            send: '\u001b[B\u001b[A\u001b',
          },
          {
            name: 'exit-after-cancel',
            waitFor: ['❯', 'cancel listed prompt'],
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, [
        'open-resume',
        'move-then-cancel',
        'exit-after-cancel',
      ])
      assert.match(result.normalizedTranscript, /cancellistedprompt/)
      assert.match(result.normalizedTranscript, /❯/)
      assert.ok(requestBodies.length === 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

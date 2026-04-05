import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { projectRoot } from './helpers/projectRoot.mjs'

const CLI_CWD = projectRoot
const CLI_PATH = join(CLI_CWD, 'dist/cli.js')
const SERIAL_TEST = { concurrency: false }
const DEFAULT_CONFIG_LINES = [
  'model_provider = "test-provider"',
  'model = "gpt-5.1-codex-mini"',
  'response_storage = false',
]

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
          response: { id: 'resp-model-effort-tui-1' },
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
    throw new Error('failed to bind model-effort TUI test provider server')
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

async function runTuiFlow({ tempHome, actions }) {
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
env["ANTHROPIC_API_KEY"] = env.get("ANTHROPIC_API_KEY", "test-key")
env["TERM"] = "xterm-256color"
env["CODEX_CODE_DISABLE_TERMINAL_TITLE"] = "1"
env["FORCE_COLOR"] = "0"
env["DISABLE_AUTOUPDATER"] = "1"
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
action_index = 0
timeout_at = time.time() + 60
last_action_clean_len = 0

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
    if action_index < len(actions):
        action = actions[action_index]
        wait_for = action.get("waitFor", [])
        scope_text = clean[last_action_clean_len:] if action.get("waitForFresh", False) else clean
        scope_normalized = re.sub(r"\s+", "", scope_text)
        if all(re.sub(r"\s+", "", token) in scope_normalized for token in wait_for):
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
            action_index += 1
            last_action_clean_len = len(clean)
            settle_ms = action.get("settleMs", 0)
            if settle_ms > 0:
                time.sleep(settle_ms / 1000.0)
            if action_index == len(actions):
                timeout_at = min(timeout_at, time.time() + 2.5)

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
          new Error(`model/effort TUI timed out\nstdout=${stdout}\nstderr=${stderr}`),
        )
      }, 65000)
    }),
  ])

  if (!stdout.trim()) {
    throw new Error(stderr || `python TUI driver exited with ${code}`)
  }
  return JSON.parse(stdout)
}

test('model and effort TUI: /model picker changes model and reasoning, then /effort agrees', SERIAL_TEST, async () => {
  await withResponsesServer(async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-model-effort-tui-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'open-model', waitFor: ['❯'], send: '/model\r' },
          {
            name: 'choose-model-and-effort',
            waitFor: ['gpt-5.1-codex-mini', 'Enter to confirm'],
            sendParts: ['\u001b[B', '\u001b[C', '\r'],
            preDelayMs: 250,
            delayMs: 120,
          },
          {
            name: 'check-model-status',
            waitFor: ['Set model to gpt-5.1-codex'],
            waitForFresh: true,
            send: '/model status\r',
          },
          {
            name: 'check-effort-status',
            waitFor: ['Current model: gpt-5.1-codex', 'reasoning: high'],
            waitForFresh: true,
            send: '/effort status\r',
          },
          {
            name: 'exit',
            waitFor: ['Current effort level: high'],
            waitForFresh: true,
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(
        result.sent,
        [
          'open-model',
          'choose-model-and-effort',
          'check-model-status',
          'check-effort-status',
          'exit',
        ],
        JSON.stringify(result),
      )
      assert.match(result.normalizedTranscript, /Selectmodel/)
      assert.match(result.normalizedTranscript, /gpt-5\.1-codex-mini/)
      assert.match(result.normalizedTranscript, /gpt-5\.1-codex/)
      assert.match(result.normalizedTranscript, /Setmodeltogpt-5\.1-codexwithhighreasoning/)
      assert.match(result.normalizedTranscript, /Currentmodel:gpt-5\.1-codex/)
      assert.match(result.normalizedTranscript, /reasoning:high/)
      assert.match(result.normalizedTranscript, /Currenteffortlevel:high/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('model and effort TUI: Esc cancels /model changes and keeps the original effort', SERIAL_TEST, async () => {
  await withResponsesServer(async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-model-effort-cancel-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'set-effort-high', waitFor: ['❯'], send: '/effort high\r' },
          {
            name: 'open-model',
            waitFor: ['Set effort level to high'],
            waitForFresh: true,
            send: '/model\r',
          },
          {
            name: 'move-and-cancel',
            waitFor: ['Select model', 'gpt-5.1-codex-max'],
            sendParts: ['\u001b[B', '\u001b[B', '\u001b[C', '\u001b'],
            preDelayMs: 250,
            delayMs: 120,
          },
          {
            name: 'check-model-status',
            waitFor: ['Kept model as gpt-5.1-codex-mini', 'reasoning: high'],
            waitForFresh: true,
            send: '/model status\r',
          },
          {
            name: 'check-effort-status',
            waitFor: ['Current model: gpt-5.1-codex-mini', 'reasoning: high'],
            waitForFresh: true,
            send: '/effort status\r',
          },
          {
            name: 'exit',
            waitFor: ['Current effort level: high'],
            waitForFresh: true,
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(
        result.sent,
        [
          'set-effort-high',
          'open-model',
          'move-and-cancel',
          'check-model-status',
          'check-effort-status',
          'exit',
        ],
        JSON.stringify(result),
      )
      assert.match(result.normalizedTranscript, /Seteffortleveltohigh/)
      assert.match(result.normalizedTranscript, /Selectmodel/)
      assert.match(result.normalizedTranscript, /gpt-5\.1-codex-max/)
      assert.match(result.normalizedTranscript, /Keptmodelasgpt-5\.1-codex-mini/)
      assert.match(result.normalizedTranscript, /Currentmodel:gpt-5\.1-codex-mini/)
      assert.match(result.normalizedTranscript, /Currenteffortlevel:high/)
      assert.equal(requestBodies.length, 0)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

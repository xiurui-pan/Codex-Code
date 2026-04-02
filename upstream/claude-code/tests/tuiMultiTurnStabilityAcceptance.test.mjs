import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const CLI_CWD = '/home/pxr/workspace/CodingAgent/Codex-Code/upstream/claude-code'
const CLI_PATH = join(CLI_CWD, 'dist/cli.js')
const SERIAL_TEST = { concurrency: false }

async function withScenarioServer(fn) {
  const requestBodies = []
  const sockets = new Set()
  const stalledResponses = new Set()

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
      const requestNumber = requestBodies.length
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        connection: 'keep-alive',
        'cache-control': 'no-cache',
      })

      if (requestNumber === 2) {
        // Round 2 stays silent until client interrupt closes this request.
        stalledResponses.add(res)
        req.on('close', () => {
          stalledResponses.delete(res)
          res.end()
        })
        return
      }

      const responseText = requestNumber === 1 ? 'ROUND_ONE_OK' : 'ROUND_THREE_OK'
      res.write(
        `event: response.output_item.done\ndata: ${JSON.stringify({
          type: 'response.output_item.done',
          item: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: responseText }],
          },
        })}\n\n`,
      )
      res.write(
        `event: response.completed\ndata: ${JSON.stringify({
          type: 'response.completed',
          response: { id: `resp-${requestNumber}` },
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
    throw new Error('failed to bind multi-turn TUI test server')
  }

  try {
    return await fn({ port: address.port, requestBodies })
  } finally {
    for (const pending of stalledResponses) {
      pending.end()
    }
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
      'model_provider = "test-provider"',
      'model = "gpt-5.1-codex-mini"',
      'model_reasoning_effort = "medium"',
      'response_storage = false',
      '',
      '[model_providers.test-provider]',
      `base_url = "http://127.0.0.1:${port}"`,
      'env_key = "ANTHROPIC_API_KEY"',
      '',
    ].join('\n'),
    'utf8',
  )
}

async function runTuiFlow({ tempHome, actions, timeoutMs = 70000 }) {
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

cli_path, cwd, temp_home, actions_json, timeout_ms = sys.argv[1:6]
actions = json.loads(actions_json)
timeout_seconds = max(float(timeout_ms) / 1000.0, 10.0)
master, slave = pty.openpty()
env = os.environ.copy()
env["HOME"] = temp_home
env["ANTHROPIC_API_KEY"] = "test-key"
env["TERM"] = "xterm-256color"
env["CLAUDE_CODE_DISABLE_TERMINAL_TITLE"] = "1"
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
timeout_at = time.time() + timeout_seconds
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
    normalized = re.sub(r"\s+", "", clean)
    if len(sent) < len(actions):
        action = actions[len(sent)]
        wait_for = action.get("waitFor", [])
        scope_text = clean[last_action_clean_len:] if action.get("waitForFresh", False) else clean
        scope_normalized = re.sub(r"\s+", "", scope_text)
        if all(re.sub(r"\s+", "", token) in scope_normalized for token in wait_for):
            os.write(master, action["send"].encode("utf-8"))
            sent.append(action["name"])
            last_action_clean_len = len(clean)
            settle_ms = action.get("settleMs", 0)
            if settle_ms > 0:
                time.sleep(settle_ms / 1000.0)
            if len(sent) == len(actions):
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
    ['-c', pythonScript, CLI_PATH, CLI_CWD, tempHome, JSON.stringify(actions), String(timeoutMs)],
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

  const driverTimeoutMs = timeoutMs + 7000
  let timeoutId
  try {
    const [code] = await Promise.race([
      once(child, 'close'),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          child.kill('SIGKILL')
          reject(new Error(`multi-turn TUI acceptance timed out\nstdout=${stdout}\nstderr=${stderr}`))
        }, driverTimeoutMs)
      }),
    ])

    if (!stdout.trim()) {
      throw new Error(stderr || `python TUI driver exited with ${code}`)
    }
    return JSON.parse(stdout)
  } finally {
    clearTimeout(timeoutId)
  }
}

test(
  'real TUI stays stable for round1 success, round2 interrupt, then /exit',
  SERIAL_TEST,
  async () => {
    await withScenarioServer(async ({ port, requestBodies }) => {
      const tempHome = await mkdtemp(join(tmpdir(), 'codex-tui-multi-turn-'))
      try {
        await writeCodexConfig(tempHome, port)
        const result = await runTuiFlow({
          tempHome,
          actions: [
            { name: 'round-one', waitFor: ['❯'], send: 'first round\r' },
            {
              name: 'round-two-start',
              waitFor: ['? for shortcuts'],
              waitForFresh: true,
              send: 'second round\r',
              settleMs: 200,
            },
            { name: 'interrupt-round-two', waitFor: ['esc to interrupt'], waitForFresh: true, send: '\u001b', settleMs: 1200 },
            {
              name: 'exit',
              waitFor: ['? for shortcuts'],
              waitForFresh: true,
              send: '/exit\r',
              settleMs: 900,
            },
          ],
        })

        assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
        assert.deepEqual(result.sent, [
          'round-one',
          'round-two-start',
          'interrupt-round-two',
          'exit',
        ])
        assert.equal(requestBodies.length, 2)
        const allRequests = JSON.stringify(requestBodies)
        assert.match(allRequests, /first round/)
        assert.match(allRequests, /second round/)
        assert.match(result.cleanedTranscript, /ROUND_ONE_OK/)
      } finally {
        await rm(tempHome, { recursive: true, force: true })
      }
    })
  },
)

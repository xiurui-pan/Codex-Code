import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { projectRoot } from './helpers/projectRoot.mjs'

const CLI_CWD = projectRoot
const CLI_PATH = join(CLI_CWD, 'dist/cli.js')
const SERIAL_TEST = { concurrency: false }

async function withStreamingScenarioServer(fn) {
  const requestBodies = []
  const sockets = new Set()
  const server = http.createServer(async (req, res) => {
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
      const idx = requestBodies.length
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        connection: 'keep-alive',
        'cache-control': 'no-cache',
      })

      const writeDelta = text => {
        res.write(
          `event: response.output_text.delta\n` +
            `data: ${JSON.stringify({
              type: 'response.output_text.delta',
              delta: text,
            })}\n\n`,
        )
      }

      const writeMessageDone = text => {
        res.write(
          `event: response.output_item.done\n` +
            `data: ${JSON.stringify({
              type: 'response.output_item.done',
              item: {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text }],
              },
            })}\n\n`,
        )
      }

      if (idx === 1) {
        writeDelta('FIRST_STREAM_OK')
        await new Promise(resolve => setTimeout(resolve, 1200))
        writeMessageDone('FIRST_DONE')
      } else {
        writeMessageDone('SECOND_OK')
      }

      res.write(
        `event: response.completed\n` +
          `data: ${JSON.stringify({
            type: 'response.completed',
            response: { id: `resp-queued-${idx}` },
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
    throw new Error('failed to bind queued command scenario server')
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

async function runTuiFlow({ tempHome, actions, timeoutMs = 70000, envOverrides = {} }) {
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

cli_path, cwd, temp_home, actions_json, timeout_ms, env_overrides_json = sys.argv[1:7]
actions = json.loads(actions_json)
env_overrides = json.loads(env_overrides_json)
timeout_seconds = max(float(timeout_ms) / 1000.0, 10.0)
master, slave = pty.openpty()
env = os.environ.copy()
env["HOME"] = temp_home
env["ANTHROPIC_API_KEY"] = env.get("ANTHROPIC_API_KEY", "test-key")
env["TERM"] = "xterm-256color"
env["CODEX_CODE_DISABLE_TERMINAL_TITLE"] = "1"
env["FORCE_COLOR"] = "0"
env["DISABLE_AUTOUPDATER"] = "1"
env["NODE_PATH"] = os.path.join(cwd, "node_modules")
for k, v in env_overrides.items():
    env[str(k)] = str(v)
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
                delay_ms = action.get("delayMs", 120)
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
    [
      '-c',
      pythonScript,
      CLI_PATH,
      CLI_CWD,
      tempHome,
      JSON.stringify(actions),
      String(timeoutMs),
      JSON.stringify(envOverrides),
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

  const driverTimeoutMs = timeoutMs + 7000
  let timeoutId
  try {
    const [code] = await Promise.race([
      once(child, 'close'),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          child.kill('SIGKILL')
          reject(new Error(`TUI queued command acceptance timed out\nstdout=${stdout}\nstderr=${stderr}`))
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

test('queued command survives sticky prompt scroll and still runs', SERIAL_TEST, async () => {
  await withStreamingScenarioServer(async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-tui-queued-'))
    try {
      await writeCodexConfig(tempHome, port)
      const firstPrompt = 'STICKY_PROMPT_LONG_TEXT_FOR_QUEUE_TEST_1234567890'
      const secondPrompt = 'QUEUED_SECOND_PROMPT'
      const result = await runTuiFlow({
        tempHome,
        envOverrides: { COLUMNS: '70', LINES: '22' },
        actions: [
          { name: 'submit-first', waitFor: ['❯'], send: `${firstPrompt}\r`, settleMs: 150 },
          {
            name: 'queue-second',
            waitFor: [firstPrompt],
            waitForFresh: true,
            preDelayMs: 150,
            send: `${secondPrompt}\r`,
            settleMs: 120,
          },
          {
            name: 'run-queued',
            waitFor: [secondPrompt],
            waitForFresh: true,
            preDelayMs: 2200,
            sendParts: ['\u001b[5~', '\u001b[A', '\r'],
            delayMs: 200,
            settleMs: 200,
          },
          {
            name: 'observe-second',
            waitFor: ['SECOND_OK'],
            waitForFresh: true,
            send: '',
          },
        ],
      })

      assert.ok([0, -15].includes(result.code), JSON.stringify(result))
      assert.deepEqual(result.sent, [
        'submit-first',
        'queue-second',
        'run-queued',
        'observe-second',
      ])
      assert.ok(requestBodies.length >= 2, JSON.stringify(requestBodies))
      const allRequests = JSON.stringify(requestBodies)
      assert.match(allRequests, new RegExp(firstPrompt))
      assert.match(allRequests, new RegExp(secondPrompt))
      assert.match(result.cleanedTranscript, /(?:F|I)RST_DONE/)
      assert.match(result.cleanedTranscript, /SECOND_OK/)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

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

async function withScenarioServer(responses, fn) {
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
      const responseText =
        responses[requestBodies.length - 1] ?? responses[responses.length - 1] ?? 'OK'
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
            content: [{ type: 'output_text', text: responseText }],
          },
        })}\n\n`,
      )
      res.write(
        `event: response.completed\ndata: ${JSON.stringify({
          type: 'response.completed',
          response: { id: `resp-display-${requestBodies.length}` },
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
    throw new Error('failed to bind TUI display scenario server')
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
    normalized = re.sub(r"\s+", "", clean)
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
          reject(new Error(`TUI display acceptance timed out\nstdout=${stdout}\nstderr=${stderr}`))
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

test('narrow terminal keeps completion focus stable and still submits mixed Chinese-English input', SERIAL_TEST, async () => {
  await withScenarioServer(['NARROW_MIX_OK'], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-tui-narrow-mix-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        envOverrides: { COLUMNS: '46', LINES: '16' },
        actions: [
          { name: 'show-completion', waitFor: ['❯'], send: '/he', settleMs: 180 },
          { name: 'dismiss-completion', waitFor: ['/help'], send: '\u001b', settleMs: 180 },
          { name: 'submit-mixed', waitFor: ['❯'], send: '请总结 English 状态 and risks\r' },
          {
            name: 'exit',
            waitFor: ['MIX_OK'],
            waitForFresh: true,
            send: '/exit\r',
            settleMs: 500,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, [
        'show-completion',
        'dismiss-completion',
        'submit-mixed',
        'exit',
      ])
      assert.equal(requestBodies.length, 1)
      const req = JSON.stringify(requestBodies[0])
      assert.match(req, /请总结/)
      assert.match(req, /English/)
      assert.match(result.cleanedTranscript, /MIX_OK/)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('long response with transcript toggle returns focus and accepts the next submit', SERIAL_TEST, async () => {
    const longBlock = `${'Long session line\n'.repeat(90)}LONG_SCROLL_OK`
    await withScenarioServer([longBlock, 'SECOND_FOCUS_OK'], async ({ port, requestBodies }) => {
      const tempHome = await mkdtemp(join(tmpdir(), 'codex-tui-focus-restore-'))
      try {
        await writeCodexConfig(tempHome, port)
        const result = await runTuiFlow({
          tempHome,
          actions: [
            { name: 'first-round', waitFor: ['❯'], send: 'first long output\r' },
            { name: 'toggle-transcript', waitFor: ['LONG_SCROLL_OK'], send: '\u000f', settleMs: 320 },
            {
              name: 'exit-transcript',
              waitFor: ['Showing detailed transcript'],
              waitForFresh: true,
              send: '\u001b',
              settleMs: 320,
            },
            {
              name: 'second-round',
              waitFor: ['❯'],
              waitForFresh: true,
              send: 'second after transcript\r',
            },
            {
              name: 'exit',
              waitFor: ['FOCUS_OK'],
              waitForFresh: true,
              send: '/exit\r',
              settleMs: 500,
            },
          ],
        })

        assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
        assert.deepEqual(result.sent, [
          'first-round',
          'toggle-transcript',
          'exit-transcript',
          'second-round',
          'exit',
        ])
        assert.equal(requestBodies.length, 2)
        const allRequests = JSON.stringify(requestBodies)
        assert.match(allRequests, /first long output/)
        assert.match(allRequests, /second after transcript/)
        assert.match(result.cleanedTranscript, /LONG_SCROLL_OK/)
        assert.match(result.cleanedTranscript, /SECOND_FOCUS_OK/)
      } finally {
        await rm(tempHome, { recursive: true, force: true })
      }
    })
  },
)

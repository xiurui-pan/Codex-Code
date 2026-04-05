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
const DEFAULT_CONFIG_LINES = [
  'model_provider = "test-provider"',
  'model = "gpt-5.1-codex-mini"',
  'model_reasoning_effort = "medium"',
  'response_storage = false',
]
const SERIAL_TEST = { concurrency: false }

async function withResponsesServer(responseText, fn) {
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
            content: [{ type: 'output_text', text: responseText }],
          },
        })}\n\n`,
      )
      res.write(
        `event: response.completed\ndata: ${JSON.stringify({
          type: 'response.completed',
          response: { id: `resp-${responseText.toLowerCase()}` },
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
    throw new Error('failed to bind TUI keyboard test provider server')
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

async function withStalledResponsesServer(fn) {
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
      // Keep the stream open without emitting events so the TUI stays in
      // "request in progress" state until user interrupt.
      req.on('close', () => {
        res.end()
      })
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
    throw new Error('failed to bind stalled TUI provider server')
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

async function seedHistory(homeDir, entries) {
  const claudeDir = join(homeDir, '.claude')
  await mkdir(claudeDir, { recursive: true })
  await writeFile(
    join(claudeDir, 'history.jsonl'),
    entries.map(entry => JSON.stringify(entry)).join('\n') + '\n',
    'utf8',
  )
}

async function runTuiFlow({ tempHome, actions, timeoutMs = 60000 }) {
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
timeout_at = time.time() + timeout_seconds

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
                action_index += 1
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
          reject(new Error(`TUI keyboard acceptance timed out\nstdout=${stdout}\nstderr=${stderr}`))
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

test('Ctrl+L redraw keeps the current draft and still submits it', SERIAL_TEST, async () => {
  await withResponsesServer('REDRAW_OK', async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-tui-redraw-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'type-before', waitFor: ['❯'], send: 'redrawbefore' },
          { name: 'ctrl-l', waitFor: ['redrawbefore'], send: '\f', settleMs: 200 },
          {
            name: 'append-and-submit',
            waitFor: ['redrawbefore'],
            sendParts: ['after', '\r'],
            delayMs: 120,
          },
          { name: 'exit', waitFor: ['DRAW_OK'], send: '/exit\r', settleMs: 500 },
        ],
      })

      assert.equal(result.code, 0, JSON.stringify(result))
      assert.deepEqual(result.sent, ['type-before', 'ctrl-l', 'append-and-submit', 'exit'])
      assert.ok(requestBodies.length >= 1)
      const requestJson = JSON.stringify(requestBodies.at(-1))
      assert.match(requestJson, /redrawbeforeafter/)
      assert.match(result.cleanedTranscript, /(?:REDRAW_OK|EDRAW_OK|DRAW_OK)/)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test(
  'history up/down can browse newer and older prompts, then submit the selected one',
  SERIAL_TEST,
  async () => {
  await withResponsesServer('HISTORY_OK', async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-tui-history-'))
    try {
      await writeCodexConfig(tempHome, port)
      await seedHistory(tempHome, [
        {
          display: 'old',
          pastedContents: {},
          timestamp: 1000,
          project: CLI_CWD,
          sessionId: 'session-old',
        },
        {
          display: 'newer',
          pastedContents: {},
          timestamp: 2000,
          project: CLI_CWD,
          sessionId: 'session-newer',
        },
      ])
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'up-newer', waitFor: ['❯'], send: '\u001b[A', settleMs: 250 },
          { name: 'up-old', waitFor: ['newer'], send: '\u001b[A', settleMs: 250 },
          { name: 'down-newer', waitFor: ['old'], send: '\u001b[B', settleMs: 1000 },
          { name: 'submit-newer', waitFor: ['newer'], send: '\r' },
          { name: 'exit', waitFor: ['HISTORY_OK'], send: '/exit\r', settleMs: 500 },
        ],
      })

      assert.equal(result.code, 0, JSON.stringify(result))
      assert.deepEqual(result.sent, [
        'up-newer',
        'up-old',
        'down-newer',
        'submit-newer',
        'exit',
      ])
      assert.match(result.cleanedTranscript, /newer/)
      assert.match(result.cleanedTranscript, /old/)
      assert.ok(requestBodies.length >= 1)
      const requestInputText = JSON.stringify(
        requestBodies.at(-1)?.input ?? [],
      )
      assert.match(requestInputText, /newer/)
      assert.doesNotMatch(requestInputText, /old/)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
  },
)

test('Ctrl+R opens history search and executes the matched prompt', SERIAL_TEST, async () => {
  await withResponsesServer('SEARCH_OK', async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-tui-search-'))
    try {
      await writeCodexConfig(tempHome, port)
      await seedHistory(tempHome, [
        {
          display: 'firstsearchentry',
          pastedContents: {},
          timestamp: 1000,
          project: CLI_CWD,
          sessionId: 'search-1',
        },
        {
          display: 'secondsearchentry',
          pastedContents: {},
          timestamp: 2000,
          project: CLI_CWD,
          sessionId: 'search-2',
        },
      ])
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'open-search', waitFor: ['❯'], send: '\u0012', settleMs: 200 },
          {
            name: 'filter-search',
            waitFor: ['search prompts:'],
            send: 'second',
            settleMs: 300,
          },
          { name: 'submit-match', waitFor: ['secondsearchentry'], send: '\r' },
          { name: 'exit', waitFor: ['ARCH_OK'], send: '/exit\r', settleMs: 500 },
        ],
      })

      assert.equal(result.code, 0, JSON.stringify(result))
      assert.deepEqual(result.sent, ['open-search', 'filter-search', 'submit-match', 'exit'])
      assert.match(result.cleanedTranscript, /search prompts:/)
      assert.ok(requestBodies.length >= 1)
      const requestJson = JSON.stringify(requestBodies.at(-1))
      assert.match(requestJson, /secondsearchentry/)
      assert.doesNotMatch(requestJson, /firstsearchentry/)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('vim mode uses Esc to leave insert mode and Enter still submits', SERIAL_TEST, async () => {
  await withResponsesServer('VIM_OK', async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-tui-vim-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'enable-vim', waitFor: ['❯'], send: '/vim\r' },
          {
            name: 'edit-in-vim',
            waitFor: ['Editor mode set to vim', '-- INSERT --'],
            sendParts: ['abc', '\u001b', 'A', '!', '\r'],
            delayMs: 140,
          },
          { name: 'exit', waitFor: ['VIM_OK'], send: '/exit\r', settleMs: 500 },
        ],
      })

      assert.equal(result.code, 0, JSON.stringify(result))
      assert.deepEqual(result.sent, ['enable-vim', 'edit-in-vim', 'exit'])
      assert.match(result.normalizedTranscript, /Editormodesettovim/)
      assert.match(result.normalizedTranscript, /--INSERT--/)
      assert.ok(requestBodies.length >= 1)
      const requestJson = JSON.stringify(requestBodies.at(-1))
      assert.match(requestJson, /abc!/)
      assert.doesNotMatch(requestJson, /abcA!/)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('after interrupting an in-flight request, /exit still exits cleanly', SERIAL_TEST, async () => {
  await withStalledResponsesServer(async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-tui-exit-after-interrupt-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        actions: [
          { name: 'submit-request', waitFor: ['❯'], send: 'hang please\r' },
          { name: 'wait-in-flight', waitFor: ['esc to interrupt'], send: '', settleMs: 500 },
          { name: 'interrupt-request', waitFor: ['esc to interrupt'], send: '\u001b', settleMs: 300 },
          { name: 'exit', waitFor: ['❯'], send: '/exit\r', settleMs: 500 },
        ],
      })

      assert.equal(result.code, 0, JSON.stringify(result))
      assert.deepEqual(result.sent, [
        'submit-request',
        'wait-in-flight',
        'interrupt-request',
        'exit',
      ])
      assert.equal(requestBodies.length, 1)
      assert.match(JSON.stringify(requestBodies[0]), /hang please/)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

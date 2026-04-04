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
const DEFAULT_CONFIG_LINES = [
  'model_provider = "test-provider"',
  'model = "gpt-5.1-codex-mini"',
  'model_reasoning_effort = "medium"',
  'response_storage = false',
]

function sseMessageText(text, id) {
  return [
    'event: response.output_item.done',
    `data: ${JSON.stringify({
      type: 'response.output_item.done',
      item: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text }],
      },
    })}`,
    '',
    'event: response.completed',
    `data: ${JSON.stringify({
      type: 'response.completed',
      response: { id },
    })}`,
    '',
    'data: [DONE]',
    '',
  ].join('\n')
}

async function withResponsesServer(responseBodies, run) {
  const requestBodies = []
  const sockets = new Set()
  let requestIndex = 0

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
      const responseBody =
        responseBodies[requestIndex] ??
        responseBodies.at(-1) ??
        sseMessageText('UNEXPECTED_PROVIDER_REPLY', 'resp-fallback')
      requestIndex += 1
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        connection: 'keep-alive',
        'cache-control': 'no-cache',
      })
      res.write(responseBody)
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
    throw new Error('failed to bind slash-command TUI test server')
  }

  try {
    return await run({ port: address.port, requestBodies })
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
clean = ""
normalized = ""
sent = []
started_at_ms = time.time() * 1000
timeout_at = time.time() + 70

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
        wait_at_least_ms = action.get("waitAtLeastMs", 0)
        time_ready = ((time.time() * 1000) - started_at_ms) >= wait_at_least_ms
        text_ready = all(re.sub(r"\s+", "", token) in normalized for token in wait_for)
        if time_ready and text_ready:
            if "sendParts" in action:
                delay_ms = action.get("delayMs", 120)
                for part in action["sendParts"]:
                    os.write(master, part.encode("utf-8"))
                    time.sleep(delay_ms / 1000.0)
            else:
                os.write(master, action["send"].encode("utf-8"))
            sent.append(action["name"])
            if len(sent) == len(actions):
                settle_ms = action.get("settleMs", 700)
                if settle_ms > 0:
                    time.sleep(settle_ms / 1000.0)
                timeout_at = time.time()

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
          new Error(
            `session slash-command TUI timed out\nstdout=${stdout}\nstderr=${stderr}`,
          ),
        )
      }, 75000)
    }),
  ])

  if (!stdout.trim()) {
    throw new Error(stderr || `python TUI driver exited with ${code}`)
  }

  return JSON.parse(stdout)
}

test('session slash commands TUI: /rename updates /status and Esc closes the status dialog', SERIAL_TEST, async () => {
  await withResponsesServer(
    [sseMessageText('RENAME_STATUS_SOURCE_REPLY', 'resp-rename-status-1')],
    async ({ port, requestBodies }) => {
      const tempHome = await mkdtemp(join(tmpdir(), 'codex-rename-status-'))
      try {
        await writeCodexConfig(tempHome, port)
        const sessionName = 'codex-status-smoke'
        const result = await runTuiFlow({
          tempHome,
          actions: [
            {
              name: 'send-first-prompt',
              waitFor: ['❯'],
              send: '请先回复 RENAME_STATUS_SOURCE_REPLY。\r',
            },
            {
              name: 'rename-session',
              waitFor: ['RENAME_STATUS_SOURCE_REPLY'],
              send: `/rename ${sessionName}\r`,
            },
            {
              name: 'open-status',
              waitFor: [`Session renamed to: ${sessionName}`],
              send: '/status\r',
            },
            {
              name: 'close-status',
              waitFor: ['Session name:', sessionName],
              send: '\u001b',
            },
            {
              name: 'exit-after-status',
              waitFor: ['Status dialog dismissed'],
              send: '/exit\r',
              settleMs: 900,
            },
          ],
        })

        assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
        assert.deepEqual(result.sent, [
          'send-first-prompt',
          'rename-session',
          'open-status',
          'close-status',
          'exit-after-status',
        ])
        assert.ok(requestBodies.length >= 1)
        assert.match(JSON.stringify(requestBodies[0] ?? {}), /RENAME_STATUS_SOURCE_REPLY/)
        const inputDump = JSON.stringify(requestBodies.map(body => body.input ?? []))
        assert.equal(inputDump.includes('/status'), false)
        assert.equal(inputDump.includes('/rename'), false)
        assert.match(result.normalizedTranscript, /Sessionrenamedto:codex-status-smoke/)
        assert.match(result.normalizedTranscript, /Sessionname:codex-status-smoke/)
        assert.match(result.normalizedTranscript, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
        assert.match(result.normalizedTranscript, /Statusdialogdismissed/)
      } finally {
        await rm(tempHome, { recursive: true, force: true })
      }
    },
  )
})

test('session slash commands TUI: /context renders local context usage without another provider request', SERIAL_TEST, async () => {
  await withResponsesServer(
    [sseMessageText('CONTEXT_SOURCE_REPLY', 'resp-context-1')],
    async ({ port, requestBodies }) => {
      const tempHome = await mkdtemp(join(tmpdir(), 'codex-context-tui-'))
      try {
        await writeCodexConfig(tempHome, port)
        const result = await runTuiFlow({
          tempHome,
          actions: [
            {
              name: 'send-first-prompt',
              waitFor: ['❯'],
              send: '请先回复 CONTEXT_SOURCE_REPLY。\r',
            },
            {
              name: 'open-context',
              waitFor: ['CONTEXT_SOURCE_REPLY'],
              send: '/context\r',
            },
            {
              name: 'exit-after-context',
              waitFor: ['Context Usage'],
              waitAtLeastMs: 1500,
              send: '/exit\r',
              settleMs: 900,
            },
          ],
        })

        assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
        assert.deepEqual(result.sent, [
          'send-first-prompt',
          'open-context',
          'exit-after-context',
        ])
        assert.equal(requestBodies.length, 1)
        assert.match(result.cleanedTranscript, /CONTEXT_SOURCE_REPLY/)
        assert.match(result.normalizedTranscript, /ContextUsage/)
        assert.match(result.normalizedTranscript, /Estimated.*bycategory/)
        assert.match(result.normalizedTranscript, /5\.1-codex-mini/)
      } finally {
        await rm(tempHome, { recursive: true, force: true })
      }
    },
  )
})

test('session slash commands TUI: /resume can reopen a session by the exact /rename title', SERIAL_TEST, async () => {
  await withResponsesServer(
    [sseMessageText('RESUME_BY_TITLE_REPLY', 'resp-resume-title-1')],
    async ({ port, requestBodies }) => {
      const tempHome = await mkdtemp(join(tmpdir(), 'codex-resume-title-'))
      try {
        await writeCodexConfig(tempHome, port)
        const sessionName = 'codex-resume-title-smoke'
        const initialRun = await runTuiFlow({
          tempHome,
          actions: [
            {
              name: 'send-first-prompt',
              waitFor: ['❯'],
              send: '请先回复 RESUME_BY_TITLE_REPLY。\r',
            },
            {
              name: 'rename-session',
              waitFor: ['RESUME_BY_TITLE_REPLY'],
              send: `/rename ${sessionName}\r`,
            },
            {
              name: 'exit-first-session',
              waitFor: [`Session renamed to: ${sessionName}`],
              send: '/exit\r',
              settleMs: 900,
            },
          ],
        })

        assert.ok(
          initialRun.code === 0 || initialRun.code === -15,
          JSON.stringify(initialRun),
        )
        assert.deepEqual(initialRun.sent, [
          'send-first-prompt',
          'rename-session',
          'exit-first-session',
        ])

        const resumedRun = await runTuiFlow({
          tempHome,
          actions: [
            {
              name: 'resume-by-title',
              waitFor: ['❯'],
              send: `/resume ${sessionName}\r`,
            },
            {
              name: 'exit-resumed-session',
              waitFor: ['RESUME_BY_TITLE_REPLY'],
              send: '/exit\r',
              settleMs: 900,
            },
          ],
        })

        assert.ok(
          resumedRun.code === 0 || resumedRun.code === -15,
          JSON.stringify(resumedRun),
        )
        assert.deepEqual(resumedRun.sent, [
          'resume-by-title',
          'exit-resumed-session',
        ])
        assert.equal(requestBodies.length, 1)
        assert.match(
          resumedRun.cleanedTranscript,
          /RESUME_BY_TITLE_REPLY/,
        )
      } finally {
        await rm(tempHome, { recursive: true, force: true })
      }
    },
  )
})

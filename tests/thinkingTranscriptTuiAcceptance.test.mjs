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
const CLI_BIN = join(CLI_CWD, 'dist/cli.js')
const SERIAL_TEST = { concurrency: false }
const DEFAULT_CONFIG_LINES = [
  'model_provider = "test-provider"',
  'model = "gpt-5.1-codex-mini"',
  'model_reasoning_effort = "medium"',
  'response_storage = false',
]

function buildReasoningResponse({
  thinking = 'Checking files',
  finalText = 'FINAL_OK',
  responseId = 'resp-thinking-transcript-1',
} = {}) {
  return [
    'event: response.reasoning_summary_part.added',
    `data: ${JSON.stringify({
      type: 'response.reasoning_summary_part.added',
      output_index: 0,
      summary_index: 0,
    })}`,
    '',
    'event: response.reasoning_summary_text.delta',
    `data: ${JSON.stringify({
      type: 'response.reasoning_summary_text.delta',
      output_index: 0,
      summary_index: 0,
      delta: thinking,
    })}`,
    '',
    'event: response.reasoning_summary_part.done',
    `data: ${JSON.stringify({
      type: 'response.reasoning_summary_part.done',
      output_index: 0,
      summary_index: 0,
    })}`,
    '',
    'event: response.output_item.done',
    `data: ${JSON.stringify({
      type: 'response.output_item.done',
      item: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: finalText }],
      },
    })}`,
    '',
    'event: response.completed',
    `data: ${JSON.stringify({
      type: 'response.completed',
      response: { id: responseId },
    })}`,
    '',
    'data: [DONE]',
    '',
  ].join('\n')
}

async function withResponsesServer(responseBody, run) {
  const sockets = new Set()
  let requestCount = 0

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
      void body
      const resolvedBody =
        typeof responseBody === 'function'
          ? responseBody(requestCount++)
          : Array.isArray(responseBody)
            ? responseBody[Math.min(requestCount++, responseBody.length - 1)]
            : responseBody
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        connection: 'keep-alive',
        'cache-control': 'no-cache',
      })
      res.write(resolvedBody)
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
    throw new Error('failed to bind thinking transcript TUI test server')
  }

  try {
    return await run({ port: address.port })
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

cli_bin, cwd, temp_home, actions_json = sys.argv[1:5]
actions = json.loads(actions_json)
master, slave = pty.openpty()
env = os.environ.copy()
env["HOME"] = temp_home
env["ANTHROPIC_API_KEY"] = "test-key"
env["TERM"] = "xterm-256color"
env["CODEX_CODE_DISABLE_TERMINAL_TITLE"] = "1"
env["FORCE_COLOR"] = "0"
env["DISABLE_AUTOUPDATER"] = "1"
proc = subprocess.Popen(
    [
        "node",
        cli_bin,
        "--dangerously-skip-permissions",
    ],
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
timeout_at = time.time() + 90

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
        if all(re.sub(r"\s+", "", token) in normalized for token in wait_for):
            os.write(master, action["send"].encode("utf-8"))
            sent.append(action["name"])
            after_send_ms = action.get("afterSendSettleMs", 0)
            if after_send_ms > 0:
                time.sleep(after_send_ms / 1000.0)
            if len(sent) == len(actions):
                settle_ms = action.get("settleMs", 1000)
                if settle_ms > 0:
                    time.sleep(settle_ms / 1000.0)
                timeout_at = time.time() + 1.0

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
    ['-c', pythonScript, CLI_BIN, CLI_CWD, tempHome, JSON.stringify(actions)],
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
            `thinking transcript TUI timed out\nstdout=${stdout}\nstderr=${stderr}`,
          ),
        )
      }, 95000)
    }),
  ])

  if (!stdout.trim()) {
    throw new Error(stderr || `python TUI driver exited with ${code}`)
  }

  return JSON.parse(stdout)
}

test(
  'TUI transcript keeps completed thinking from multiple turns',
  SERIAL_TEST,
  async () => {
    const tempHome = await mkdtemp(
      join(tmpdir(), 'codex-thinking-transcript-multiturn-'),
    )

    try {
      await withResponsesServer(
        [
          buildReasoningResponse({
            thinking: 'First turn thinking',
            finalText: 'FIRST_OK',
            responseId: 'resp-thinking-transcript-first',
          }),
          buildReasoningResponse({
            thinking: 'Second turn thinking',
            finalText: 'SECOND_OK',
            responseId: 'resp-thinking-transcript-second',
          }),
        ],
        async ({ port }) => {
          await writeCodexConfig(tempHome, port)

          const result = await runTuiFlow({
            tempHome,
            actions: [
              {
                name: 'first-prompt',
                waitFor: ['❯'],
                send: 'first turn\r',
              },
              {
                name: 'second-prompt',
                waitFor: ['FIRST_OK'],
                send: 'second turn\r',
                afterSendSettleMs: 1500,
              },
              {
                name: 'open-transcript',
                waitFor: [],
                send: '\u000f',
                settleMs: 1500,
              },
            ],
          })

          assert.deepEqual(result.sent, [
            'first-prompt',
            'second-prompt',
            'open-transcript',
          ])
          assert.match(result.normalizedTranscript, /FIRST_OK/)
          assert.match(result.normalizedTranscript, /SECOND_OK/)
          assert.match(result.normalizedTranscript, /Firstturnthinking/)
          assert.match(result.normalizedTranscript, /Secondturnthinking/)
        },
      )
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  },
)

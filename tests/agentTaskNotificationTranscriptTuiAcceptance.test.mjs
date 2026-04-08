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

function sseBlock(item) {
  return (
    'event: response.output_item.done\n' +
    `data: ${JSON.stringify({ type: 'response.output_item.done', item })}\n\n`
  )
}

function sseCompleted(id) {
  return (
    'event: response.completed\n' +
    `data: ${JSON.stringify({ type: 'response.completed', response: { id } })}\n\n` +
    'data: [DONE]\n\n'
  )
}

async function withResponsesServer(run) {
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
      const parsed = JSON.parse(body)
      requestBodies.push(parsed)
      const bodyText = JSON.stringify(parsed)
      const responseId = `resp-task-notification-${requestIndex++}`

      let responseBody
      const hasCompletedAgentNotification =
        bodyText.includes(
          '<summary>Agent \\"background transcript\\" completed</summary>',
        ) && bodyText.includes('<result>BG_TASK_FINAL_OK</result>')

      if (hasCompletedAgentNotification) {
        responseBody = [
          sseBlock({
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'TASK_NOTIFICATION_ACK' }],
          }),
          sseCompleted(responseId),
        ].join('')
      } else if (bodyText.includes('function_call_output')) {
        responseBody = [
          sseBlock({
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'MAIN_AFTER_BG_DONE' }],
          }),
          sseCompleted(responseId),
        ].join('')
      } else if (bodyText.includes('BG_TASK_FINAL_OK')) {
        responseBody = [
          sseBlock({
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'BG_TASK_FINAL_OK' }],
          }),
          sseCompleted(responseId),
        ].join('')
      } else {
        responseBody = [
          sseBlock({
            type: 'function_call',
            call_id: 'agent-background-1',
            name: 'Agent',
            arguments: JSON.stringify({
              description: 'background transcript',
              prompt: 'Reply with exactly BG_TASK_FINAL_OK.',
              subagent_type: 'general-purpose',
              run_in_background: true,
            }),
          }),
          sseCompleted(responseId),
        ].join('')
      }

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
    throw new Error('failed to bind task notification transcript test server')
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
  const claudeDir = join(homeDir, '.claude')
  await mkdir(codexDir, { recursive: true })
  await mkdir(claudeDir, { recursive: true })
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

async function runInteractiveTuiFlow({ tempHome, actions }) {
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
env["CLAUDE_CONFIG_DIR"] = os.path.join(temp_home, ".claude")
env["ANTHROPIC_API_KEY"] = "test-key"
env["TERM"] = "xterm-256color"
env["CODEX_CODE_DISABLE_TERMINAL_TITLE"] = "1"
env["FORCE_COLOR"] = "0"
env["DISABLE_AUTOUPDATER"] = "1"
env["CODEX_CODE_DISABLE_BROWSER"] = "1"
env["CODEX_CODE_DISABLE_SESSION_DATA_UPLOAD"] = "1"
pid, master = pty.fork()
if pid == 0:
    os.chdir(cwd)
    os.execvpe(
        "node",
        ["node", cli_bin, "--dangerously-skip-permissions"],
        env,
    )
ansi_re = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\].*?(?:\x07|\x1b\\)")
buffer = b""
clean = ""
normalized = ""
sent = []
timeout_at = time.time() + 90

while time.time() < timeout_at:
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
            settle_ms = action.get("settleMs", 0)
            if settle_ms > 0:
                time.sleep(settle_ms / 1000.0)
            if len(sent) == len(actions):
                timeout_at = time.time() + 2.5

try:
    pid_done, status = os.waitpid(pid, os.WNOHANG)
except ChildProcessError:
    pid_done, status = pid, 0

if pid_done == 0:
    os.kill(pid, signal.SIGTERM)
    try:
        limit = time.time() + 5
        while time.time() < limit:
            pid_done, status = os.waitpid(pid, os.WNOHANG)
            if pid_done != 0:
                break
            time.sleep(0.1)
        else:
            os.kill(pid, signal.SIGKILL)
            pid_done, status = os.waitpid(pid, 0)
    except ChildProcessError:
        pid_done, status = pid, 0

clean = ansi_re.sub("", buffer.decode("utf-8", "ignore"))
if os.WIFEXITED(status):
    code = os.WEXITSTATUS(status)
elif os.WIFSIGNALED(status):
    code = -os.WTERMSIG(status)
else:
    code = None
print(json.dumps({
    "code": code,
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

  let timeoutId
  let code
  try {
    ;[code] = await Promise.race([
      once(child, 'close'),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          child.kill('SIGKILL')
          reject(
            new Error(
              `task notification transcript TUI timed out\nstdout=${stdout}\nstderr=${stderr}`,
            ),
          )
        }, 95000)
      }),
    ])
  } finally {
    clearTimeout(timeoutId)
  }

  if (!stdout.trim()) {
    throw new Error(stderr || `python TUI driver exited with ${code}`)
  }

  return JSON.parse(stdout)
}

test(
  'TUI transcript: background task notifications include the final agent response',
  SERIAL_TEST,
  async () => {
    await withResponsesServer(async ({ port, requestBodies }) => {
      const tempHome = await mkdtemp(join(tmpdir(), 'codex-task-notification-'))
      try {
        await writeCodexConfig(tempHome, port)
        const result = await runInteractiveTuiFlow({
          tempHome,
          actions: [
            {
              name: 'prompt',
              waitFor: ['❯'],
              send: 'please launch a background agent\r',
            },
            {
              name: 'open-transcript',
              waitFor: ['background transcript'],
              send: '\u000f',
            },
            {
              name: 'exit',
              waitFor: ['Response:BG_TASK_FINAL_OK'],
              send: '/exit\r',
              settleMs: 1600,
            },
          ],
        })

        const normalizedTranscript = result.normalizedTranscript
        assert.deepEqual(result.sent, ['prompt', 'open-transcript', 'exit'])
        assert.ok(requestBodies.length >= 3)
        assert.match(
          normalizedTranscript,
          /backgroundtranscript"completed/i,
        )
        assert.match(normalizedTranscript, /Response:BG_TASK_FINAL_OK/i)
      } finally {
        await rm(tempHome, { recursive: true, force: true })
      }
    })
  },
)

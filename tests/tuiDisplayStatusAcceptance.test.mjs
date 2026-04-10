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
  'model = "gpt-5.4"',
  'small_fast_model = "gpt-5.4-mini"',
  'model_reasoning_effort = "medium"',
  'response_storage = false',
]

async function withResponsesServer(handler, run) {
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
      const parsed = JSON.parse(body)
      requestBodies.push(parsed)
      try {
        await handler({
          req,
          res,
          body: parsed,
          requestIndex: requestBodies.length - 1,
        })
      } catch (error) {
        res.destroy(error)
      }
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
    throw new Error('failed to bind TUI display status test server')
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

function writeSseEvent(res, event, data) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function writeSseDone(res) {
  res.write('data: [DONE]\n\n')
  res.end()
}

async function writeCodexConfig(homeDir, port, overrides = {}) {
  const codexDir = join(homeDir, '.codex')
  const claudeDir = join(homeDir, '.claude')
  const model = overrides.model ?? 'gpt-5.4'
  const smallFastModel = overrides.smallFastModel ?? 'gpt-5.4-mini'
  const effort = overrides.effort ?? 'medium'
  await mkdir(codexDir, { recursive: true })
  await mkdir(claudeDir, { recursive: true })
  await writeFile(
    join(codexDir, 'config.toml'),
    [
      'model_provider = "test-provider"',
      `model = "${model}"`,
      `small_fast_model = "${smallFastModel}"`,
      `model_reasoning_effort = "${effort}"`,
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
started_at_ms = time.time() * 1000
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
        wait_at_least_ms = action.get("waitAtLeastMs", 0)
        time_ready = ((time.time() * 1000) - started_at_ms) >= wait_at_least_ms
        text_ready = all(re.sub(r"\s+", "", token) in normalized for token in wait_for)
        if time_ready and text_ready:
            pre_delay_ms = action.get("preDelayMs", 0)
            if pre_delay_ms > 0:
                time.sleep(pre_delay_ms / 1000.0)
            os.write(master, action["send"].encode("utf-8"))
            sent.append(action["name"])
            settle_ms = action.get("settleMs", 0)
            if settle_ms > 0:
                time.sleep(settle_ms / 1000.0)
            if len(sent) == len(actions):
                timeout_at = time.time() + 2.0

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
  try {
    const [code] = await Promise.race([
      once(child, 'close'),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          child.kill('SIGKILL')
          reject(
            new Error(
              `TUI display status test timed out\nstdout=${stdout}\nstderr=${stderr}`,
            ),
          )
        }, 95_000)
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
  'full TUI keeps footer status visible while the first streamed text is on screen',
  SERIAL_TEST,
  async () => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-tui-thinking-footer-'))

    try {
      await withResponsesServer(
        async ({ res }) => {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            connection: 'keep-alive',
            'cache-control': 'no-cache',
          })

          writeSseEvent(res, 'response.reasoning_summary_part.added', {
            type: 'response.reasoning_summary_part.added',
            output_index: 0,
            summary_index: 0,
          })
          writeSseEvent(res, 'response.reasoning_summary_text.delta', {
            type: 'response.reasoning_summary_text.delta',
            output_index: 0,
            summary_index: 0,
            delta: 'Checking files',
          })
          writeSseEvent(res, 'response.reasoning_summary_part.done', {
            type: 'response.reasoning_summary_part.done',
            output_index: 0,
            summary_index: 0,
          })
          writeSseEvent(res, 'response.output_text.delta', {
            type: 'response.output_text.delta',
            delta: 'Let me inspect that',
          })
          await new Promise(resolve => setTimeout(resolve, 1200))
          writeSseEvent(res, 'response.output_item.done', {
            type: 'response.output_item.done',
            item: {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Let me inspect that' }],
            },
          })
          writeSseEvent(res, 'response.completed', {
            type: 'response.completed',
            response: { id: 'resp-footer-thinking' },
          })
          writeSseDone(res)
        },
        async ({ port }) => {
          await writeCodexConfig(tempHome, port)

          const result = await runTuiFlow({
            tempHome,
            actions: [
              {
                name: 'prompt',
                waitFor: ['❯'],
                send: 'check footer\r',
                settleMs: 1500,
              },
            ],
          })

          assert.deepEqual(result.sent, ['prompt'])
          assert.match(result.normalizedTranscript, /Letmeinspect/i)
          assert.match(result.normalizedTranscript, /that/i)
          assert.match(
            result.normalizedTranscript,
            /(thinking|thoughtfor[0-9]+s)/i,
          )
        },
      )
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  },
)

test(
  'full TUI switches XhighPlan to xhigh after entering plan mode',
  SERIAL_TEST,
  async () => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-full-tui-xhighplan-'))

    try {
      await withResponsesServer(
        async ({ res }) => {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            connection: 'keep-alive',
            'cache-control': 'no-cache',
          })
          writeSseEvent(res, 'response.output_item.done', {
            type: 'response.output_item.done',
            item: {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'PLAN_OK' }],
            },
          })
          writeSseEvent(res, 'response.completed', {
            type: 'response.completed',
            response: { id: 'resp-full-tui-xhighplan' },
          })
          writeSseDone(res)
        },
        async ({ port, requestBodies }) => {
          await writeCodexConfig(tempHome, port, { model: 'gpt-5.4-mini' })

          const result = await runTuiFlow({
            tempHome,
            actions: [
              {
                name: 'set-xhighplan',
                waitFor: ['❯'],
                send: '/model xhighplan\r',
              },
              {
                name: 'enter-plan',
                waitFor: ['Set model to XhighPlan'],
                send: '/plan\r',
              },
              {
                name: 'check-effort',
                waitFor: ['Enabled plan mode'],
                preDelayMs: 300,
                send: '/effort status\r',
              },
              {
                name: 'ask',
                waitFor: ['Current effort level: xhigh'],
                send: '计划模式下一句\r',
              },
              {
                name: 'exit',
                waitFor: ['PLAN_OK'],
                send: '/exit\r',
                settleMs: 1200,
              },
            ],
          })

          assert.deepEqual(result.sent, [
            'set-xhighplan',
            'enter-plan',
            'check-effort',
            'ask',
            'exit',
          ])
          assert.match(result.normalizedTranscript, /Currenteffortlevel:xhigh/i)
          assert.equal(requestBodies.length, 1)
          assert.equal(requestBodies[0]?.model, 'gpt-5.4')
          assert.equal(requestBodies[0]?.reasoning?.effort, 'xhigh')
        },
      )
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  },
)

test(
  'full TUI keyboard mode cycling switches XhighPlan to xhigh in plan mode',
  SERIAL_TEST,
  async () => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-full-tui-xhighplan-cycle-'))

    try {
      await withResponsesServer(
        async ({ res }) => {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            connection: 'keep-alive',
            'cache-control': 'no-cache',
          })
          writeSseEvent(res, 'response.output_item.done', {
            type: 'response.output_item.done',
            item: {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'CYCLE_OK' }],
            },
          })
          writeSseEvent(res, 'response.completed', {
            type: 'response.completed',
            response: { id: 'resp-full-tui-xhighplan-cycle' },
          })
          writeSseDone(res)
        },
        async ({ port, requestBodies }) => {
          await writeCodexConfig(tempHome, port, { model: 'gpt-5.4-mini' })

          const result = await runTuiFlow({
            tempHome,
            actions: [
              {
                name: 'set-xhighplan',
                waitFor: ['❯'],
                send: '/model xhighplan\r',
              },
              {
                name: 'cycle-to-default',
                waitFor: ['Set model to XhighPlan'],
                send: '\u001b[Z',
              },
              {
                name: 'cycle-to-accept',
                waitFor: ['default mode on'],
                send: '\u001b[Z',
              },
              {
                name: 'cycle-to-plan',
                waitFor: ['accept edits on'],
                send: '\u001b[Z',
              },
              {
                name: 'check-effort',
                waitFor: ['plan mode on'],
                preDelayMs: 300,
                send: '/effort status\r',
              },
              {
                name: 'ask',
                waitFor: ['Current effort level: xhigh'],
                send: '键盘切 plan 后回答一次\r',
              },
              {
                name: 'exit',
                waitFor: ['CYCLE_OK'],
                send: '/exit\r',
                settleMs: 1200,
              },
            ],
          })

          console.log(JSON.stringify(result))
          assert.deepEqual(result.sent, [
            'set-xhighplan',
            'cycle-to-default',
            'cycle-to-accept',
            'cycle-to-plan',
            'check-effort',
            'ask',
            'exit',
          ])
          assert.match(result.normalizedTranscript, /Currenteffortlevel:xhigh/i)
          assert.equal(requestBodies.length, 1)
          assert.equal(requestBodies[0]?.model, 'gpt-5.4')
          assert.equal(requestBodies[0]?.reasoning?.effort, 'xhigh')
        },
      )
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  },
)

test(
  'full TUI shows the Explore helper model on grouped agent progress rows',
  SERIAL_TEST,
  async () => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-tui-explore-model-'))

    try {
      await withResponsesServer(
        async ({ res, requestIndex }) => {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            connection: 'keep-alive',
            'cache-control': 'no-cache',
          })

          if (requestIndex === 0) {
            writeSseEvent(res, 'response.output_item.done', {
              type: 'response.output_item.done',
              item: {
                type: 'function_call',
                call_id: 'agent-explore-1',
                name: 'Agent',
                arguments: JSON.stringify({
                  description: 'scan repo',
                  prompt: 'Reply with exactly EXPLORE_OK.',
                  subagent_type: 'Explore',
                }),
              },
            })
            writeSseEvent(res, 'response.completed', {
              type: 'response.completed',
              response: { id: 'resp-main-explore-1' },
            })
            writeSseDone(res)
            return
          }

          if (requestIndex === 1) {
            writeSseEvent(res, 'response.output_item.done', {
              type: 'response.output_item.done',
              item: {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'EXPLORE_OK' }],
              },
            })
            writeSseEvent(res, 'response.completed', {
              type: 'response.completed',
              response: { id: 'resp-agent-explore-1' },
            })
            writeSseDone(res)
            return
          }

          writeSseEvent(res, 'response.output_item.done', {
            type: 'response.output_item.done',
            item: {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'MAIN_DONE' }],
            },
          })
          writeSseEvent(res, 'response.completed', {
            type: 'response.completed',
            response: { id: 'resp-main-explore-2' },
          })
          writeSseDone(res)
        },
        async ({ port }) => {
          await writeCodexConfig(tempHome, port)

          const result = await runTuiFlow({
            tempHome,
            actions: [
              {
                name: 'prompt',
                waitFor: ['❯'],
                send: 'use Explore\r',
              },
              {
                name: 'exit',
                waitFor: ['gpt-5.4-mini'],
                send: '/exit\r',
                settleMs: 1200,
              },
            ],
          })

          assert.deepEqual(result.sent, ['prompt', 'exit'])
          assert.match(result.normalizedTranscript, /Explore.*gpt-5\.4-mini/i)
        },
      )
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  },
)

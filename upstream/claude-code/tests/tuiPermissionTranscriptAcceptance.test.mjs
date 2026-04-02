import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const CLI_CWD = '/home/pxr/workspace/CodingAgent/Codex-Code/upstream/claude-code'
const CLI_PATH = join(CLI_CWD, 'dist/cli.js')
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

function sseFunctionCall(command, callId, responseId) {
  return [
    'event: response.output_item.done',
    `data: ${JSON.stringify({
      type: 'response.output_item.done',
      item: {
        type: 'function_call',
        call_id: callId,
        name: 'Bash',
        arguments: JSON.stringify({ command }),
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

async function withResponsesServer(responseBodies, run, onRequestBody) {
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
      const parsedBody = JSON.parse(body)
      requestBodies.push(parsedBody)
      onRequestBody?.(parsedBody, requestBodies.length)
      const responseBody =
        responseBodies[requestIndex] ??
        responseBodies.at(-1) ??
        sseMessageText('UNEXPECTED', 'resp-fallback')
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
    throw new Error('failed to bind TUI acceptance test server')
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
env["CLAUDE_CODE_DISABLE_TERMINAL_TITLE"] = "1"
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
        wait_for_file = action.get("waitForFile")
        wait_at_least_ms = action.get("waitAtLeastMs", 0)
        time_ready = ((time.time() * 1000) - started_at_ms) >= wait_at_least_ms
        file_ready = not wait_for_file or os.path.exists(wait_for_file)
        text_ready = all(re.sub(r"\s+", "", token) in normalized for token in wait_for)
        if time_ready and file_ready and text_ready:
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
            `tui acceptance flow timed out\nstdout=${stdout}\nstderr=${stderr}`,
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

async function assertMissing(path) {
  await assert.rejects(access(path))
}

async function runPermissionScenario({
  promptText,
  commandMarker,
  finalText,
  decisionInput,
  expectFileWritten,
  minRequestCount = 1,
  exitWaitFor = finalText ? [finalText] : ['❯'],
  exitWaitForFile = null,
  promptWaitFor = ['❯'],
  promptWaitAtLeastMs = 0,
  decisionWaitFor = ['Bash command', 'Do you want to proceed?'],
  decisionWaitAtLeastMs = 0,
}) {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-tui-permission-'))
  const outsidePath = join(tempHome, `${commandMarker}.txt`)
  const command = `echo ${commandMarker} > ${outsidePath}`

  try {
    const resolvedExitWaitForFile =
      exitWaitForFile === true ? outsidePath : exitWaitForFile
    await withResponsesServer(
      [
        sseFunctionCall(command, `call-${commandMarker}`, `resp-${commandMarker}-1`),
        sseMessageText(finalText, `resp-${commandMarker}-2`),
      ],
      async ({ port, requestBodies }) => {
        await writeCodexConfig(tempHome, port)
        const result = await runTuiFlow({
          tempHome,
          actions: [
            {
              name: 'send-prompt',
              waitFor: promptWaitFor,
              waitAtLeastMs: promptWaitAtLeastMs,
              send: `${promptText}\r`,
            },
            {
              name: 'permission-decision',
              waitFor: decisionWaitFor,
              waitAtLeastMs: decisionWaitAtLeastMs,
              send: decisionInput,
            },
            {
              name: 'exit-after-final',
              waitFor: exitWaitFor,
              waitForFile: resolvedExitWaitForFile,
              send: '/exit\r',
              settleMs: 900,
            },
          ],
        })

        assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
        assert.deepEqual(result.sent, [
          'send-prompt',
          'permission-decision',
          'exit-after-final',
        ])
        assert.match(result.normalizedTranscript, /Bashcommand/)
        assert.match(result.normalizedTranscript, /Doyouwanttoproceed\?/)
        if (finalText) {
          assert.match(result.cleanedTranscript, new RegExp(finalText))
        }
        assert.ok(requestBodies.length >= minRequestCount)
        assert.match(JSON.stringify(requestBodies[0]), new RegExp(promptText))

        if (expectFileWritten) {
          const written = await readFile(outsidePath, 'utf8')
          assert.match(written, new RegExp(commandMarker))
        } else {
          await assertMissing(outsidePath)
        }
      },
    )
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
}

test('TUI permission dialog: Enter allows the default option and the command runs', async () => {
  await runPermissionScenario({
    promptText: '请触发一次需要权限的 Bash 命令。',
    commandMarker: 'TUI_PERMISSION_ALLOW',
    finalText: null,
    decisionInput: '\r',
    expectFileWritten: true,
    exitWaitFor: [],
    exitWaitForFile: true,
  })
})

test('TUI permission dialog: moving to No and pressing Enter denies the command', async () => {
  await runPermissionScenario({
    promptText: '请触发一次被拒绝的 Bash 命令。',
    commandMarker: 'TUI_PERMISSION_DENY',
    finalText: null,
    decisionInput: '3',
    expectFileWritten: false,
    requestCount: 1,
    exitWaitFor: ['❯'],
  })
})

test('TUI permission dialog: Esc cancels the prompt and the command does not run', async () => {
  await runPermissionScenario({
    promptText: '请触发一次按 Esc 取消的 Bash 命令。',
    commandMarker: 'TUI_PERMISSION_ESC',
    finalText: null,
    decisionInput: '\u001b',
    expectFileWritten: false,
    requestCount: 1,
    exitWaitFor: ['❯'],
    promptWaitFor: ['❯'],
    promptWaitAtLeastMs: 200,
    decisionWaitFor: ['Bash command'],
  })
})

test('TUI transcript mode: Ctrl+O enters and exits transcript, then focus returns to input', async () => {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-tui-transcript-'))
  try {
    await withResponsesServer(
      [
        sseMessageText('TRANSCRIPT_FIRST_DONE', 'resp-transcript-1'),
        sseMessageText('TRANSCRIPT_SECOND_DONE', 'resp-transcript-2'),
      ],
      async ({ port, requestBodies }) => {
        await writeCodexConfig(tempHome, port)
        const result = await runTuiFlow({
          tempHome,
          actions: [
            {
              name: 'send-first-prompt',
              waitFor: ['❯'],
              send: '先回复 TRANSCRIPT_FIRST_DONE。\r',
            },
            {
              name: 'enter-transcript',
              waitFor: ['TRANSCRIPT_FIRST_DONE'],
              send: '\u000f',
            },
            {
              name: 'exit-transcript',
              waitFor: ['Showing detailed transcript'],
              send: '\u000f',
            },
            {
              name: 'send-second-prompt',
              waitFor: ['❯', 'TRANSCRIPT_FIRST_DONE'],
              sendParts: ['再回复 TRANSCRIPT_SECOND_DONE。', '/exit\r'],
              delayMs: 1200,
              settleMs: 900,
            },
          ],
        })

        assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
        assert.deepEqual(result.sent, [
          'send-first-prompt',
          'enter-transcript',
          'exit-transcript',
          'send-second-prompt',
        ])
        assert.match(result.cleanedTranscript, /TRANSCRIPT_FIRST_DONE/)
        assert.match(result.normalizedTranscript, /Showingdetailedtranscript/)
        assert.ok(requestBodies.length >= 1)
        assert.match(JSON.stringify(requestBodies[0]), /TRANSCRIPT_FIRST_DONE/)
      },
    )
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
})

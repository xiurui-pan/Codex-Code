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
        responseBodies[requestIndex] ?? responseBodies.at(-1) ?? ''
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
    throw new Error('failed to bind tool transcript TUI test server')
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
        "--bare",
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
timeout_at = time.time() + 80

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
            if len(sent) == len(actions):
                settle_ms = action.get("settleMs", 1200)
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
    [
      '-c',
      pythonScript,
      CLI_BIN,
      CLI_CWD,
      tempHome,
      JSON.stringify(actions),
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

  let timeoutId
  try {
    const [code] = await Promise.race([
      once(child, 'close'),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          child.kill('SIGKILL')
          reject(
            new Error(`tool transcript TUI timed out\nstdout=${stdout}\nstderr=${stderr}`),
          )
        }, 85000)
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

async function runFullTuiFlow({ tempHome, actions }) {
  const pythonScript = String.raw`
import json
import os
import pty
import re
import select
import signal
import sys
import time

cli_bin, cwd, temp_home, actions_json = sys.argv[1:5]
actions = json.loads(actions_json)
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
        status = 0

if os.WIFEXITED(status):
    code = os.WEXITSTATUS(status)
elif os.WIFSIGNALED(status):
    code = 128 + os.WTERMSIG(status)
else:
    code = None

clean = ansi_re.sub("", buffer.decode("utf-8", "ignore"))
print(json.dumps({
    "code": code,
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
      CLI_BIN,
      CLI_CWD,
      tempHome,
      JSON.stringify(actions),
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

  let timeoutId
  try {
    const [code] = await Promise.race([
      once(child, 'close'),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          child.kill('SIGKILL')
          reject(
            new Error(`full TUI transcript test timed out\nstdout=${stdout}\nstderr=${stderr}`),
          )
        }, 95000)
      }),
    ])

    if (!stdout.trim()) {
      throw new Error(stderr || `python full TUI driver exited with ${code}`)
    }
    return JSON.parse(stdout)
  } finally {
    clearTimeout(timeoutId)
  }
}

test(
  'TUI transcript: commentary stays visible, bash is not duplicated, read/search stays collapsed',
  SERIAL_TEST,
  async () => {
    await withResponsesServer(
      [
        [
          sseBlock({
            type: 'message',
            role: 'assistant',
            phase: 'commentary',
            content: [
              {
                type: 'output_text',
                text: 'I will inspect the workspace before answering.',
              },
            ],
          }),
          sseBlock({
            type: 'function_call',
            call_id: 'tool-bash-1',
            name: 'Bash',
            arguments: JSON.stringify({
              command: 'pwd',
            }),
          }),
          sseCompleted('resp-tool-transcript-1'),
        ].join(''),
        [
          sseBlock({
            type: 'function_call',
            call_id: 'tool-read-1',
            name: 'Read',
            arguments: JSON.stringify({
              file_path: join(CLI_CWD, 'package.json'),
            }),
          }),
          sseBlock({
            type: 'function_call',
            call_id: 'tool-grep-1',
            name: 'Grep',
            arguments: JSON.stringify({
              pattern: 'showTokens',
              path: join(CLI_CWD, 'src/components/Spinner'),
            }),
          }),
          sseCompleted('resp-tool-transcript-2'),
        ].join(''),
        [
          sseBlock({
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'done after tools' }],
          }),
          sseCompleted('resp-tool-transcript-3'),
        ].join(''),
      ],
      async ({ port }) => {
        const tempHome = await mkdtemp(join(tmpdir(), 'codex-tool-transcript-'))
        try {
          await writeCodexConfig(tempHome, port)
          const result = await runTuiFlow({
            tempHome,
            actions: [
              {
                name: 'prompt',
                waitFor: ['❯'],
                send: 'please inspect tools and finish\r',
              },
              {
                name: 'exit',
                waitFor: ['done after tools'],
                send: '/exit\r',
                settleMs: 1600,
              },
            ],
          })

          const cleanedTranscript = result.cleanedTranscript
          const normalizedTranscript = result.normalizedTranscript
          const bashToolCallHits =
            normalizedTranscript.match(/(?:Bash\(pwd\)|\bpwd\b)/g)?.length ?? 0
          const preambleIndex = normalizedTranscript.indexOf(
            'workspacebeforeanswering.',
          )
          const bashIndex = normalizedTranscript.search(/Bash\(pwd\)|\bpwd\b/i)

          assert.equal(result.sent[0], 'prompt')
          assert.equal(result.sent.at(-1), 'exit')
          assert.match(
            normalizedTranscript,
            /workspacebeforeanswering\./i,
          )
          assert.match(normalizedTranscript, /doneaftertools/i)
          assert.ok(
            bashToolCallHits <= 1,
            `expected bash command to render at most once, transcript was:
${cleanedTranscript}`,
          )
          assert.ok(
            preambleIndex !== -1 && bashIndex !== -1 && preambleIndex < bashIndex,
            `expected commentary to stay visible before bash in TUI transcript, transcript was:
${cleanedTranscript}`,
          )
          assert.match(normalizedTranscript, /Read1file/i)
          assert.match(normalizedTranscript, /1pattern/i)
        } finally {
          await rm(tempHome, { recursive: true, force: true })
        }
      },
    )
  },
)

test(
  'Full TUI transcript: execution does not stay silent after an initial tool call',
  SERIAL_TEST,
  async () => {
    await withResponsesServer(
      [
        [
          sseBlock({
            type: 'function_call',
            call_id: 'tool-bash-full-1',
            name: 'Bash',
            arguments: JSON.stringify({
              command: 'pwd',
            }),
          }),
          sseCompleted('resp-full-transcript-1'),
        ].join(''),
        [
          sseBlock({
            type: 'message',
            role: 'assistant',
            phase: 'commentary',
            content: [
              {
                type: 'output_text',
                text: 'I found the workspace. Next I will read package.json.',
              },
            ],
          }),
          sseBlock({
            type: 'function_call',
            call_id: 'tool-read-full-1',
            name: 'Read',
            arguments: JSON.stringify({
              file_path: join(CLI_CWD, 'package.json'),
            }),
          }),
          sseCompleted('resp-full-transcript-2'),
        ].join(''),
        [
          sseBlock({
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'done after tools' }],
          }),
          sseCompleted('resp-full-transcript-3'),
        ].join(''),
      ],
      async ({ port }) => {
        const tempHome = await mkdtemp(join(tmpdir(), 'codex-full-tool-transcript-'))
        try {
          await writeCodexConfig(tempHome, port)
          const result = await runFullTuiFlow({
            tempHome,
            actions: [
              {
                name: 'prompt',
                waitFor: ['❯'],
                send: 'please inspect package and finish\r',
              },
              {
                name: 'exit',
                waitFor: ['done after tools'],
                send: '/exit\r',
                settleMs: 1200,
              },
            ],
          })

          const cleanedTranscript = result.cleanedTranscript
          const normalizedTranscript = result.normalizedTranscript
          const bashIndex = normalizedTranscript.search(/Bash\(pwd\)|\bpwd\b/i)
          const commentaryIndex = normalizedTranscript.search(
            /Ifoundtheworkspace\.NextIwillreadpackage\.json\./i,
          )
          const readIndex = normalizedTranscript.search(
            /Reading1file|1file\(ctrl\+otoexpand\)/i,
          )

          assert.equal(result.sent[0], 'prompt')
          assert.equal(result.sent.at(-1), 'exit')
          assert.ok(bashIndex !== -1, `expected initial bash call in full TUI transcript:\n${cleanedTranscript}`)
          assert.ok(
            commentaryIndex !== -1,
            `expected commentary after the initial tool call in full TUI transcript:\n${cleanedTranscript}`,
          )
          assert.ok(readIndex !== -1, `expected read card in full TUI transcript:\n${cleanedTranscript}`)
          assert.ok(
            bashIndex < commentaryIndex && commentaryIndex < readIndex,
            `expected commentary to appear after the first tool and before the next tool in full TUI transcript:\n${cleanedTranscript}`,
          )
          assert.match(normalizedTranscript, /doneaftertools/i)
        } finally {
          await rm(tempHome, { recursive: true, force: true })
        }
      },
    )
  },
)

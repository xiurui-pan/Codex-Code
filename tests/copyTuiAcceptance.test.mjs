import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
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
          response: { id: `resp-copy-${requestBodies.length}` },
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
    throw new Error('failed to bind TUI copy scenario server')
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

async function writeGlobalConfig(homeDir) {
  await writeFile(
    join(homeDir, '.claude.json'),
    JSON.stringify(
      {
        copyFullResponse: true,
        projects: {},
        cachedStatsigGates: {},
        cachedDynamicConfigs: {},
        cachedGrowthBookFeatures: {},
        respectGitignore: true,
      },
      null,
      2,
    ),
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
import sys
import time

cli_path, cwd, temp_home, actions_json, timeout_ms, env_overrides_json = sys.argv[1:7]
actions = json.loads(actions_json)
env_overrides = json.loads(env_overrides_json)
timeout_seconds = max(float(timeout_ms) / 1000.0, 10.0)
env = os.environ.copy()
env["HOME"] = temp_home
env["ANTHROPIC_API_KEY"] = env.get("ANTHROPIC_API_KEY", "test-key")
env["TERM"] = "xterm-256color"
env["CODEX_CODE_DISABLE_TERMINAL_TITLE"] = "1"
env["FORCE_COLOR"] = "0"
env["DISABLE_AUTOUPDATER"] = "1"
for k, v in env_overrides.items():
    env[str(k)] = str(v)
pid, fd = pty.fork()
if pid == 0:
    os.chdir(cwd)
    os.execvpe("node", ["node", cli_path, "--bare"], env)
ansi_re = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\].*?(?:\x07|\x1b\\)")
buffer = b""
sent = []
action_index = 0
timeout_at = time.time() + timeout_seconds
last_action_clean_len = 0

while time.time() < timeout_at:
    try:
        pid_done, _ = os.waitpid(pid, os.WNOHANG)
    except ChildProcessError:
        pid_done = pid
    if pid_done == pid:
        break
    ready, _, _ = select.select([fd], [], [], 0.1)
    if ready:
        try:
            chunk = os.read(fd, 65536)
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
                    os.write(fd, part.encode("utf-8"))
                    time.sleep(delay_ms / 1000.0)
            else:
                os.write(fd, action["send"].encode("utf-8"))
            sent.append(action["name"])
            action_index += 1
            last_action_clean_len = len(clean)
            settle_ms = action.get("settleMs", 0)
            if settle_ms > 0:
                time.sleep(settle_ms / 1000.0)
            if action_index == len(actions):
                timeout_at = min(timeout_at, time.time() + 2.5)

try:
    os.kill(pid, signal.SIGTERM)
except ProcessLookupError:
    pass
try:
    os.waitpid(pid, 0)
except ChildProcessError:
    pass

clean = ansi_re.sub("", buffer.decode("utf-8", "ignore"))
print(json.dumps({
    "code": 0,
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
          reject(new Error(`TUI copy acceptance timed out\nstdout=${stdout}\nstderr=${stderr}`))
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

test('copy command writes full response in TUI', SERIAL_TEST, async () => {
  await withScenarioServer(['COPY_ME'], async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-tui-copy-'))
    try {
      await writeCodexConfig(tempHome, port)
      const result = await runTuiFlow({
        tempHome,
        envOverrides: {
          CODEX_CODE_USE_CODEX_PROVIDER: '1',
          CODEX_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        },
        actions: [
          { name: 'first-round', waitFor: ['❯'], send: 'please respond with COPY_ME\r' },
          { name: 'invoke-copy', waitFor: ['COPY_ME'], send: '/copy\r', settleMs: 400 },
          { name: 'exit', waitFor: ['Copied', 'clipboard'], send: '/exit\r', settleMs: 400 },
        ],
      })

      assert.equal(result.code, 0, JSON.stringify(result))
      assert.deepEqual(result.sent, ['first-round', 'invoke-copy', 'exit'])
      assert.equal(requestBodies.length, 1)
      assert.match(result.cleanedTranscript, /Copiedtoclipboard/)

      const copied = await readFile('/tmp/claude/response.md', 'utf8')
      assert.match(copied, /COPY_ME/)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

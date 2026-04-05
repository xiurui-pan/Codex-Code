import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { projectRoot } from './helpers/projectRoot.mjs'

const CLI_CWD = projectRoot
const CLI_PATH = join(CLI_CWD, 'dist/cli.js')

async function withResponsesServer(run) {
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
            content: [{ type: 'output_text', text: 'UNEXPECTED_PROVIDER_REPLY' }],
          },
        })}\n\n`,
      )
      res.write(
        `event: response.completed\ndata: ${JSON.stringify({
          type: 'response.completed',
          response: { id: 'resp-buddy-1' },
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
    throw new Error('failed to bind buddy slash command test server')
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

async function readGlobalConfig(tempHome) {
  const candidates = [
    join(tempHome, '.claude', '.config.json'),
    ...(await readdir(tempHome)).filter(
      name => name.startsWith('.claude') && name.endsWith('.json'),
    ).map(name => join(tempHome, name)),
  ]

  for (const candidate of candidates) {
    try {
      await access(candidate)
      return JSON.parse(await readFile(candidate, 'utf8'))
    } catch {}
  }

  throw new Error(`global config file not found under ${tempHome}`)
}

async function runTuiFlow({ tempHome, currentCwd, actions, envOverrides = {} }) {
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

cli_path, cwd, temp_home, actions_json, env_overrides_json = sys.argv[1:6]
actions = json.loads(actions_json)
env_overrides = json.loads(env_overrides_json)
master, slave = pty.openpty()
env = os.environ.copy()
env["HOME"] = temp_home
env["ANTHROPIC_API_KEY"] = env.get("ANTHROPIC_API_KEY", "test-key")
env["TERM"] = "xterm-256color"
env["CODEX_CODE_DISABLE_TERMINAL_TITLE"] = "1"
env["FORCE_COLOR"] = "0"
env["DISABLE_AUTOUPDATER"] = "1"
for key, value in env_overrides.items():
    env[key] = value
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
        for action in actions:
            if action["name"] in sent:
                continue
            wait_for = action.get("waitFor", [])
            if all(re.sub(r"\s+", "", token) in normalized for token in wait_for):
                os.write(master, action["send"].encode("utf-8"))
                sent.append(action["name"])
                if len(sent) == len(actions):
                    settle_ms = action.get("settleMs", 600)
                    if settle_ms > 0:
                        time.sleep(settle_ms / 1000.0)
                    timeout_at = time.time()
                break

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

  const proc = spawn('python3', [
    '-c',
    pythonScript,
    CLI_PATH,
    currentCwd,
    tempHome,
    JSON.stringify(actions),
    JSON.stringify(envOverrides),
  ])

  let stdout = ''
  let stderr = ''
  proc.stdout.on('data', chunk => {
    stdout += chunk.toString()
  })
  proc.stderr.on('data', chunk => {
    stderr += chunk.toString()
  })

  const [code] = await once(proc, 'close')
  if (code !== 0) {
    throw new Error(stderr || stdout || `PTY harness exited with code ${code}`)
  }
  return JSON.parse(stdout)
}

test('buddy slash commands TUI hatch and pet without calling the provider', async () => {
  await withResponsesServer(async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-buddy-tui-'))
    const tempProject = await mkdtemp(join(CLI_CWD, '.tmp-buddy-cwd-'))

    try {
      await writeCodexConfig(tempHome, port)

      const result = await runTuiFlow({
        tempHome,
        currentCwd: tempProject,
        envOverrides: {
          CLAUDE_CODE_ENABLED_FEATURES: 'BUDDY',
          CLAUDE_CODE_FEATURE_BUDDY: '1',
        },
        actions: [
          { name: 'hatch-buddy', waitFor: ['❯'], send: '/buddy\r' },
          {
            name: 'pet-buddy',
            waitFor: ['Buddy hatched:'],
            send: '/buddy pet\r',
          },
          {
            name: 'exit',
            waitFor: ['You pet'],
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      const globalConfig = await readGlobalConfig(tempHome)
      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['hatch-buddy', 'pet-buddy', 'exit'])
      assert.equal(requestBodies.length, 0)
      assert.match(result.normalizedTranscript, /Buddyhatched:/)
      assert.match(result.normalizedTranscript, /Youpet/)
      assert.equal(typeof globalConfig.companion?.name, 'string')
    } finally {
      await rm(tempProject, { recursive: true, force: true })
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

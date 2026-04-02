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

const CLI_CWD = '/home/pxr/workspace/CodingAgent/Codex-Code/upstream/claude-code'
const CLI_PATH = join(CLI_CWD, 'dist/cli.js')
const SERIAL_TEST = { concurrency: false }
const DEFAULT_CONFIG_LINES = [
  'model_provider = "test-provider"',
  'model = "gpt-5.1-codex-mini"',
  'model_reasoning_effort = "medium"',
  'response_storage = false',
]

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
          response: { id: 'resp-config-mode-slash-1' },
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
    throw new Error('failed to bind config/mode slash command test server')
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

async function prepareGlobalConfigHome(homeDir) {
  const claudeDir = join(homeDir, '.claude')
  await mkdir(claudeDir, { recursive: true })
  await writeFile(join(claudeDir, '.config.json'), '{}\n', 'utf8')
}

async function writeProjectSettings(cwd, settings) {
  const claudeDir = join(cwd, '.claude')
  await mkdir(claudeDir, { recursive: true })
  await writeFile(
    join(claudeDir, 'settings.json'),
    JSON.stringify(settings, null, 2),
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
env["CLAUDE_CONFIG_DIR"] = os.path.join(temp_home, ".claude")
env["ANTHROPIC_API_KEY"] = env.get("ANTHROPIC_API_KEY", "test-key")
env["TERM"] = "xterm-256color"
env["CLAUDE_CODE_DISABLE_TERMINAL_TITLE"] = "1"
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
        normalized_lines = [
            re.sub(r"\s+", "", line) for line in clean.splitlines() if line.strip()
        ]
        for action in actions:
            if action["name"] in sent:
                continue
            after = action.get("after")
            if after is not None and after not in sent:
                continue
            wait_for = action.get("waitFor", [])
            wait_at_least_ms = action.get("waitAtLeastMs", 0)
            fallback_after_ms = action.get("fallbackAfterMs", 0)
            elapsed_ms = (time.time() * 1000) - started_at_ms
            time_ready = elapsed_ms >= wait_at_least_ms
            wait_ready = all(re.sub(r"\s+", "", token) in normalized for token in wait_for)
            fallback_ready = fallback_after_ms > 0 and elapsed_ms >= fallback_after_ms
            if time_ready and (wait_ready or fallback_ready):
                pre_delay_ms = action.get("preDelayMs", 0)
                if pre_delay_ms > 0:
                    time.sleep(pre_delay_ms / 1000.0)
                if "selectByPattern" in action:
                    match = None
                    for line in normalized_lines:
                        line_match = re.match(action["selectByPattern"], line)
                        if line_match:
                            match = line_match
                            break
                    if not match:
                        continue
                    os.write(master, match.group(1).encode("utf-8"))
                elif "sendParts" in action:
                    delay_ms = action.get("delayMs", 100)
                    for part in action["sendParts"]:
                        os.write(master, part.encode("utf-8"))
                        time.sleep(delay_ms / 1000.0)
                else:
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

  const child = spawn(
    'python3',
    [
      '-c',
      pythonScript,
      CLI_PATH,
      currentCwd,
      tempHome,
      JSON.stringify(actions),
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

  const [code] = await Promise.race([
    once(child, 'close'),
    new Promise((_, reject) => {
      setTimeout(() => {
        child.kill('SIGKILL')
        reject(
          new Error(
            `config/mode slash command TUI timed out\nstdout=${stdout}\nstderr=${stderr}`,
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

test('config/mode slash commands TUI: /theme updates the global theme without calling the provider', SERIAL_TEST, async () => {
  await withResponsesServer(async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-theme-tui-'))
    const tempProject = await mkdtemp(join(CLI_CWD, '.tmp-theme-cwd-'))
    try {
      await writeCodexConfig(tempHome, port)
      await prepareGlobalConfigHome(tempHome)
      const result = await runTuiFlow({
        tempHome,
        currentCwd: tempProject,
        actions: [
          {
            name: 'type-theme-command',
            waitFor: ['❯'],
            fallbackAfterMs: 2500,
            preDelayMs: 300,
            send: '/theme',
          },
          {
            name: 'submit-theme-command',
            waitFor: ['/theme', 'Change the theme'],
            preDelayMs: 150,
            send: '\r',
          },
          {
            name: 'choose-light',
            waitFor: ['Theme', 'Dark mode', 'Light mode'],
            sendParts: ['\u001b[B', '\r'],
            preDelayMs: 250,
            delayMs: 120,
          },
          {
            name: 'exit',
            waitFor: ['Theme set to light'],
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      const globalConfig = await readGlobalConfig(tempHome)
      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, [
        'type-theme-command',
        'submit-theme-command',
        'choose-light',
        'exit',
      ])
      assert.equal(requestBodies.length, 0)
      assert.match(result.normalizedTranscript, /Theme/)
      assert.match(result.normalizedTranscript, /Themesettolight/i)
      assert.equal(globalConfig.theme, 'light')
    } finally {
      await rm(tempProject, { recursive: true, force: true })
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('config/mode slash commands TUI: /vim toggles vim mode without calling the provider', SERIAL_TEST, async () => {
  await withResponsesServer(async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-vim-tui-'))
    const tempProject = await mkdtemp(join(CLI_CWD, '.tmp-vim-cwd-'))
    try {
      await writeCodexConfig(tempHome, port)
      await prepareGlobalConfigHome(tempHome)
      const result = await runTuiFlow({
        tempHome,
        currentCwd: tempProject,
        actions: [
          { name: 'toggle-vim', waitFor: ['❯'], send: '/vim\r' },
          {
            name: 'exit',
            waitFor: ['Editor mode set to vim'],
            send: '/exit\r',
            settleMs: 800,
          },
        ],
      })

      const globalConfig = await readGlobalConfig(tempHome)
      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['toggle-vim', 'exit'])
      assert.equal(requestBodies.length, 0)
      assert.match(result.normalizedTranscript, /Editormodesettovim/)
      assert.match(
        result.normalizedTranscript,
        /UseEscapekeytotogglebetweenINSERTandNORMALmo/,
      )
      assert.equal(globalConfig.editorMode, 'vim')
    } finally {
      await rm(tempProject, { recursive: true, force: true })
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('config/mode slash commands TUI: /permissions shows project rules and Esc dismisses the dialog', SERIAL_TEST, async () => {
  await withResponsesServer(async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-permissions-tui-'))
    const tempProject = await mkdtemp(join(CLI_CWD, '.tmp-permissions-cwd-'))
    try {
      await writeCodexConfig(tempHome, port)
      await prepareGlobalConfigHome(tempHome)
      await writeProjectSettings(tempProject, {
        permissions: {
          allow: ['Bash(ls:*)'],
        },
      })

      const result = await runTuiFlow({
        tempHome,
        currentCwd: tempProject,
        actions: [
          { name: 'open-permissions', waitFor: ['❯'], send: '/permissions\r' },
          {
            name: 'dismiss-permissions',
            waitFor: ['Permissions:'],
            preDelayMs: 500,
            send: '\u001b',
          },
          {
            name: 'exit',
            waitFor: ['Permissions dialog dismissed'],
            send: '/exit\r',
            settleMs: 900,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, [
        'open-permissions',
        'dismiss-permissions',
        'exit',
      ])
      assert.equal(requestBodies.length, 0)
      assert.match(result.normalizedTranscript, /Permissions:/)
      assert.match(result.normalizedTranscript, /Addanewrule/)
      assert.match(result.normalizedTranscript, /Permissionsdialogdismissed/)
    } finally {
      await rm(tempProject, { recursive: true, force: true })
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('config/mode slash commands TUI: /memory opens the project memory file without calling the provider', SERIAL_TEST, async () => {
  await withResponsesServer(async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-memory-tui-'))
    const tempProject = await mkdtemp(join(CLI_CWD, '.tmp-memory-project-cwd-'))
    try {
      await writeCodexConfig(tempHome, port)
      await prepareGlobalConfigHome(tempHome)
      const memoryPath = join(tempProject, 'CLAUDE.md')
      const result = await runTuiFlow({
        tempHome,
        currentCwd: tempProject,
        envOverrides: { EDITOR: 'true' },
        actions: [
          { name: 'open-memory', waitFor: ['❯'], send: '/memory\r' },
          {
            name: 'choose-project-memory',
            after: 'open-memory',
            waitFor: ['Memory', 'Checked in at', 'CLAUDE.md'],
            waitAtLeastMs: 2500,
            preDelayMs: 1000,
            selectByPattern: '^(\\d+)\\..*Checkedinat\\./CLAUDE\\.md$',
          },
          {
            name: 'exit',
            after: 'choose-project-memory',
            waitFor: ['Opened memory file at', 'CLAUDE.md'],
            send: '/exit\r',
            settleMs: 900,
          },
        ],
      })
      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['open-memory', 'choose-project-memory', 'exit'])
      assert.equal(requestBodies.length, 0)
      await access(memoryPath)
      const memoryContent = await readFile(memoryPath, 'utf8')
      assert.equal(memoryContent, '')
      assert.match(result.normalizedTranscript, /Memory/)
      assert.match(result.normalizedTranscript, /Openedmemoryfileat/)
      assert.match(result.cleanedTranscript, /\.\/CLAUDE\.md/)
    } finally {
      await rm(tempProject, { recursive: true, force: true })
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('config/mode slash commands TUI: /memory can create and open user memory without calling the provider', SERIAL_TEST, async () => {
  await withResponsesServer(async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-memory-user-tui-'))
    const tempProject = await mkdtemp(join(CLI_CWD, '.tmp-memory-user-cwd-'))
    try {
      await writeCodexConfig(tempHome, port)
      await prepareGlobalConfigHome(tempHome)
      const userMemoryPath = join(tempHome, '.claude', 'CLAUDE.md')
      const result = await runTuiFlow({
        tempHome,
        currentCwd: tempProject,
        envOverrides: { EDITOR: 'true' },
        actions: [
          { name: 'open-memory', waitFor: ['❯'], send: '/memory\r' },
          {
            name: 'choose-user-memory',
            after: 'open-memory',
            waitFor: ['Memory', 'Saved in ~/.claude/CLAUDE.md'],
            waitAtLeastMs: 2500,
            preDelayMs: 1000,
            selectByPattern: '^(\\d+)\\..*Savedin~/.claude/CLAUDE\\.md$',
          },
          {
            name: 'exit',
            after: 'choose-user-memory',
            waitAtLeastMs: 1200,
            fallbackAfterMs: 4000,
            send: '/exit\r',
            settleMs: 900,
          },
        ],
      })
      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, ['open-memory', 'choose-user-memory', 'exit'])
      assert.equal(requestBodies.length, 0)
      await access(userMemoryPath)
      const memoryContent = await readFile(userMemoryPath, 'utf8')
      assert.equal(memoryContent, '')
      assert.match(result.normalizedTranscript, /Usermemory|\.claude\/CLAUDE\.md/)
      assert.match(result.normalizedTranscript, /Savedin~\/\.claude\/CLAUDE\.md/)
      assert.match(result.cleanedTranscript, /CLAUDE\.md/)
    } finally {
      await rm(tempProject, { recursive: true, force: true })
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

test('config/mode slash commands TUI: /memory shows imported entries and opens the selected memory without provider traffic', SERIAL_TEST, async () => {
  await withResponsesServer(async ({ port, requestBodies }) => {
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-memory-import-tui-'))
    const tempProject = await mkdtemp(join(CLI_CWD, '.tmp-memory-import-cwd-'))
    try {
      await writeCodexConfig(tempHome, port)
      await prepareGlobalConfigHome(tempHome)
      await mkdir(join(tempProject, 'notes'), { recursive: true })
      await writeFile(
        join(tempProject, 'CLAUDE.md'),
        '# Project memory\n@./notes/imported-memory.md\n',
        'utf8',
      )
      const importedMemoryPath = join(
        tempProject,
        'notes',
        'imported-memory.md',
      )
      await writeFile(
        importedMemoryPath,
        'Imported memory says KEEP_IMPORTED_MEMORY.\n',
        'utf8',
      )

      const result = await runTuiFlow({
        tempHome,
        currentCwd: tempProject,
        envOverrides: { EDITOR: 'true' },
        actions: [
          { name: 'open-memory', waitFor: ['❯'], send: '/memory\r' },
          {
            name: 'choose-imported-memory',
            after: 'open-memory',
            waitFor: ['Memory', 'imported-memory.md', '@-imported'],
            waitAtLeastMs: 1200,
            preDelayMs: 700,
            selectByPattern: '^(\\d+)\\..*imported-memory\\.md.*@-imported$',
          },
          {
            name: 'exit',
            after: 'choose-imported-memory',
            waitFor: ['Opened memory file at', 'imported-memory.md'],
            send: '/exit\r',
            settleMs: 900,
          },
        ],
      })

      assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
      assert.deepEqual(result.sent, [
        'open-memory',
        'choose-imported-memory',
        'exit',
      ])
      assert.equal(requestBodies.length, 0)
      const memoryContent = await readFile(importedMemoryPath, 'utf8')
      assert.equal(memoryContent, 'Imported memory says KEEP_IMPORTED_MEMORY.\n')
      assert.match(result.normalizedTranscript, /imported-memory\.md/)
      assert.match(result.normalizedTranscript, /Openedmemoryfileat/)
    } finally {
      await rm(tempProject, { recursive: true, force: true })
      await rm(tempHome, { recursive: true, force: true })
    }
  })
})

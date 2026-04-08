import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { projectRoot } from './helpers/projectRoot.mjs'

const CLI_CWD = projectRoot
const CLI_PATH = join(CLI_CWD, 'dist/cli.js')
const SERIAL_TEST = { concurrency: false }

async function writeCodexConfig(homeDir) {
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
      'base_url = "http://127.0.0.1:1"',
      'env_key = "ANTHROPIC_API_KEY"',
      '',
    ].join('\n'),
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
env["ANTHROPIC_API_KEY"] = "test-key"
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
                timeout_at = min(timeout_at, time.time() + 2.0)

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

  let timeoutId
  const [code] = await Promise.race([
    once(child, 'close'),
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`help dismiss TUI timed out\nstdout=${stdout}\nstderr=${stderr}`))
      }, timeoutMs + 5000)
    }),
  ])
  clearTimeout(timeoutId)

  if (!stdout.trim()) {
    throw new Error(stderr || `python TUI driver exited with ${code}`)
  }

  return JSON.parse(stdout)
}

test('/help TUI: Esc closes help and restores the normal prompt area', SERIAL_TEST, async () => {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-help-dismiss-'))
  try {
    await writeCodexConfig(tempHome)
    const result = await runTuiFlow({
      tempHome,
      actions: [
        { name: 'open-help', waitFor: ['❯'], send: '/help\r' },
        {
          name: 'dismiss-help',
          waitFor: ['For more help:', 'esc to cancel', 'commands', 'custom-commands'],
          send: '\u001b',
        },
        {
          name: 'exit',
          waitFor: ['Help dialog dismissed'],
          send: '/exit\r',
          settleMs: 800,
        },
      ],
    })

    assert.ok(result.code === 0 || result.code === -15, JSON.stringify(result))
    assert.deepEqual(result.sent, ['open-help', 'dismiss-help', 'exit'])
    assert.match(result.normalizedTranscript, /Helpdialogdismissed/)

    const helpDismissedAt = result.normalizedTranscript.lastIndexOf('Helpdialogdismissed')
    const promptAt = result.normalizedTranscript.lastIndexOf('❯')
    const cancelHintAt = result.normalizedTranscript.lastIndexOf('esctocancel')

    assert.ok(helpDismissedAt >= 0, result.cleanedTranscript)
    assert.ok(promptAt > helpDismissedAt, result.cleanedTranscript)
    assert.ok(cancelHintAt >= 0 && cancelHintAt < helpDismissedAt, result.cleanedTranscript)
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
})

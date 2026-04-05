/**
 * Real PTY test for /init command with actual Codex provider.
 * This uses the real provider at localhost:3000.
 *
 * Run: node --test tests/tuiInitRealProvider.smoke.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

const cwd = projectRoot
const cliPath = join(cwd, 'dist/cli.js')

async function runTuiInitReal({ tempHome, timeoutSeconds = 120 }) {
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

cli_path, cwd, temp_home = sys.argv[1:4]
timeout_seconds = int(sys.argv[4]) if len(sys.argv) > 4 else 120
master, slave = pty.openpty()
env = os.environ.copy()
env["HOME"] = temp_home
env["ANTHROPIC_API_KEY"] = os.environ.get("CRS_OAI_KEY", "")
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
prompt_seen = False
sent_init = False
response_seen = False
sent_exit = False
timeout_at = time.time() + timeout_seconds
phases = []

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
        if chr(0x276f) in clean:
            prompt_seen = True
        if prompt_seen and not sent_init:
            os.write(master, b"/init\r")
            sent_init = True
            phases.append("sent_init")
        # Look for signs that the model is working:
        # - "analyzing" or "CLAUDE.md" in output = model responded
        # - "Cooking" = model is processing
        if sent_init and not response_seen:
            if any(kw in clean.lower() for kw in ["claude.md", "analyzing", "codebase", "build", "architecture"]):
                response_seen = True
                phases.append("response_seen")
        if response_seen and not sent_exit:
            # Wait a bit then exit
            time.sleep(3)
            os.write(master, b"/exit\r")
            sent_exit = True
            phases.append("sent_exit")
        # Safety: exit if cooking for too long without response
        if sent_init and not response_seen and time.time() > timeout_at - 10:
            os.write(master, b"/exit\r")
            sent_exit = True
            phases.append("timeout_exit")

if proc.poll() is None:
    proc.send_signal(signal.SIGTERM)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)

clean = ansi_re.sub("", buffer.decode("utf-8", "ignore"))
result = {
    "code": proc.returncode,
    "promptSeen": prompt_seen,
    "sentInit": sent_init,
    "responseSeen": response_seen,
    "sentExit": sent_exit,
    "phases": phases,
    "durationSec": round(time.time() - (timeout_at - timeout_seconds), 1),
    "cleanedTranscript": clean,
}
print(json.dumps(result))
`

  const child = spawn(
    'python3',
    ['-c', pythonScript, cliPath, cwd, tempHome, String(timeoutSeconds)],
    {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => { stderr += chunk })

  const [exitCode] = await once(child, 'exit')
  return { stdout, stderr, exitCode }
}

test('TUI /init with real Codex provider', async t => {
  if (!process.env.CRS_OAI_KEY) {
    t.diagnostic('Skipping: CRS_OAI_KEY not set')
    return
  }

  // Use a temp home that inherits the real ~/.codex config
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-code-init-real-'))
  const codexDir = join(tempHome, '.codex')
  await mkdir(codexDir, { recursive: true })
  // Copy the real config
  const realConfig = await readFile(join(process.env.HOME, '.codex', 'config.toml'), 'utf8')
  await writeFile(join(codexDir, 'config.toml'), realConfig)
  t.after(() => rm(tempHome, { recursive: true, force: true }))

  const result = await runTuiInitReal({ tempHome, timeoutSeconds: 120 })

  let parsed
  try {
    parsed = JSON.parse(result.stdout.trim().split('\n').pop())
  } catch {
    console.error('Python stdout:', result.stdout.slice(-500))
    console.error('Python stderr:', result.stderr.slice(-500))
    assert.fail('Python PTY script did not produce JSON output')
  }

  console.log('PTY result:', {
    code: parsed.code,
    promptSeen: parsed.promptSeen,
    sentInit: parsed.sentInit,
    responseSeen: parsed.responseSeen,
    sentExit: parsed.sentExit,
    phases: parsed.phases,
    durationSec: parsed.durationSec,
  })

  // Print transcript excerpt for artifact recording
  const transcript = parsed.cleanedTranscript || ''
  console.log('\nTranscript excerpt (last 800 chars):')
  console.log(transcript.slice(-800))

  assert.ok(parsed.promptSeen, 'TUI prompt should appear')
  assert.ok(parsed.sentInit, '/init should have been sent')
  assert.ok(parsed.responseSeen, 'Model should respond with codebase analysis content')
})

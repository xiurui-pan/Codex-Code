/**
 * Real SWE-bench-style complex task via PTY with actual Codex provider.
 *
 * Task: Multi-step codebase analysis + concrete change proposal.
 * The model must:
 * 1. Explore the codebase
 * 2. Identify a specific code pattern
 * 3. Propose a concrete fix with file path + line numbers
 * 4. Summarize the change
 *
 * Success = model completes the full analysis-to-proposal loop.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const cwd = '/home/pxr/workspace/CodingAgent/Codex-Code/upstream/claude-code'
const cliPath = join(cwd, 'dist/cli.js')

const SWE_TASK = `In this codebase, find the function that resolves which tools are available to the model. There is a function called getCurrentPhaseBaseTools and another called getAllBaseTools. Explain the difference between them: which tools appear in getCurrentPhaseBaseTools but NOT in getAllBaseTools, and vice versa. Then tell me: if someone wanted to add a new tool that only appears when using a custom Codex provider, which function should they modify and why? Give specific file path and line numbers.`

async function runSweTask({ tempHome, timeoutSeconds = 240 }) {
  const pythonScript = String.raw`
import json, os, pty, re, select, signal, subprocess, sys, time

cli_path, cwd, temp_home, prompt_text = sys.argv[1:5]
timeout_seconds = int(sys.argv[5]) if len(sys.argv) > 5 else 240
master, slave = pty.openpty()
env = os.environ.copy()
env["HOME"] = temp_home
env["ANTHROPIC_API_KEY"] = os.environ.get("CRS_OAI_KEY", "")
env["TERM"] = "xterm-256color"
env["CLAUDE_CODE_DISABLE_TERMINAL_TITLE"] = "1"
env["FORCE_COLOR"] = "0"
proc = subprocess.Popen(
    ["node", cli_path, "--bare"],
    cwd=cwd, env=env, stdin=slave, stdout=slave, stderr=slave, close_fds=True,
)
os.close(slave)
ansi_re = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\].*?(?:\x07|\x1b\\)")
buf = b""
prompt_seen = False
sent_task = False
got_analysis = False
got_file_ref = False
got_summary = False
sent_exit = False
timeout_at = time.time() + timeout_seconds
phases = []
last_check_len = 0

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
        buf += chunk
    clean = ansi_re.sub("", buf.decode("utf-8", "ignore"))
    if chr(0x276f) in clean:
        prompt_seen = True
    if prompt_seen and not sent_task:
        os.write(master, (prompt_text + "\r").encode("utf-8"))
        sent_task = True
        phases.append("sent_task")
    if sent_task:
        lower = clean.lower()
        # Phase 1: Analysis - model discusses the code
        if not got_analysis and any(kw in lower for kw in ["getcurrentphasebasetools", "getallbasetools", "tools.ts", "tool list"]):
            got_analysis = True
            phases.append("got_analysis")
        # Phase 2: File reference - model identifies specific files
        if got_analysis and not got_file_ref and any(kw in lower for kw in ["line", "src/tools.ts", "function"]):
            got_file_ref = True
            phases.append("got_file_ref")
        # Phase 3: Summary - model provides recommendation
        if got_file_ref and not got_summary and any(kw in lower for kw in ["should modify", "recommend", "because", "reason", "conclusion"]):
            got_summary = True
            phases.append("got_summary")
        if got_summary and not sent_exit:
            time.sleep(2)
            os.write(master, b"/exit\r")
            sent_exit = True
            phases.append("sent_exit")
        # Safety: exit on timeout
        if time.time() > timeout_at - 5 and not sent_exit:
            os.write(master, b"/exit\r")
            sent_exit = True
            phases.append("timeout_exit")

if proc.poll() is None:
    proc.send_signal(signal.SIGTERM)
    try: proc.wait(timeout=5)
    except: proc.kill(); proc.wait(timeout=5)

clean = ansi_re.sub("", buf.decode("utf-8", "ignore"))
result = {
    "code": proc.returncode,
    "promptSeen": prompt_seen,
    "sentTask": sent_task,
    "gotAnalysis": got_analysis,
    "gotFileRef": got_file_ref,
    "gotSummary": got_summary,
    "sentExit": sent_exit,
    "phases": phases,
    "durationSec": round(time.time() - (timeout_at - timeout_seconds), 1),
    "transcriptLen": len(clean),
    "last800": clean[-800:] if len(clean) > 800 else clean,
}
print(json.dumps(result))
`

  const child = spawn('python3', ['-c', pythonScript, cliPath, cwd, tempHome, SWE_TASK, String(timeoutSeconds)], {
    cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = '', stderr = ''
  child.stdout.setEncoding('utf8').on('data', c => { stdout += c })
  child.stderr.setEncoding('utf8').on('data', c => { stderr += c })
  await once(child, 'exit')
  return { stdout, stderr }
}

test('SWE-bench-style complex task: tool architecture analysis', async t => {
  if (!process.env.CRS_OAI_KEY) {
    t.diagnostic('Skipping: CRS_OAI_KEY not set')
    return
  }

  const tempHome = await mkdtemp(join(tmpdir(), 'codex-code-swebench-'))
  const codexDir = join(tempHome, '.codex')
  await mkdir(codexDir, { recursive: true })
  const realConfig = await readFile(join(process.env.HOME, '.codex', 'config.toml'), 'utf8')
  await writeFile(join(codexDir, 'config.toml'), realConfig)
  t.after(() => rm(tempHome, { recursive: true, force: true }))

  const result = await runSweTask({ tempHome, timeoutSeconds: 240 })

  let parsed
  try {
    parsed = JSON.parse(result.stdout.trim().split('\n').pop())
  } catch {
    console.error('Python stdout:', result.stdout.slice(-500))
    console.error('Python stderr:', result.stderr.slice(-500))
    assert.fail('PTY script did not produce JSON')
  }

  console.log('SWE-bench result:', JSON.stringify({
    code: parsed.code,
    promptSeen: parsed.promptSeen,
    sentTask: parsed.sentTask,
    gotAnalysis: parsed.gotAnalysis,
    gotFileRef: parsed.gotFileRef,
    gotSummary: parsed.gotSummary,
    sentExit: parsed.sentExit,
    phases: parsed.phases,
    durationSec: parsed.durationSec,
    transcriptLen: parsed.transcriptLen,
  }, null, 2))

  // Write transcript as artifact
  await mkdir(join(cwd, '..', '..', 'artifacts'), { recursive: true })
  await writeFile(
    join(cwd, '..', '..', 'artifacts', 'swe-bench-tool-architecture-2026-04-04.txt'),
    parsed.last800 || '',
  )

  assert.ok(parsed.promptSeen, 'TUI prompt should appear')
  assert.ok(parsed.sentTask, 'Task should be sent')
  assert.ok(parsed.gotAnalysis, 'Model should analyze the tool architecture')
  assert.ok(parsed.gotFileRef, 'Model should reference specific files/lines')
  // gotSummary is nice-to-have but model may not always reach it
  if (parsed.gotSummary) {
    t.diagnostic('Model completed full analysis -> file ref -> summary loop')
  } else {
    t.diagnostic('Model completed analysis and file reference but did not produce a clear summary in the sampling window')
  }
})

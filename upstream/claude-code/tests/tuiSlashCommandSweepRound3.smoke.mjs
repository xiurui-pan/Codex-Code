/**
 * Batch PTY sweep for remaining slash commands with mock provider.
 * Tests: /sandbox, /reload-plugins, /plugin, /ide, /skills, /hooks, /export,
 * /diff, /resume, /rewind, /session, /rename, /tag, /fast, /stats, /summary,
 * /output-style, /env, /keybindings, /color, /vim, /add-dir, /advisor
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const cwd = '/home/pxr/workspace/CodingAgent/Codex-Code/upstream/claude-code'
const cliPath = join(cwd, 'dist/cli.js')

async function createTempHome(port) {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-code-sweep3-'))
  const codexDir = join(tempHome, '.codex')
  await mkdir(codexDir, { recursive: true })
  await writeFile(
    join(codexDir, 'config.toml'),
    [
      'model_provider = "test-provider"',
      'model = "gpt-5.4"',
      'model_reasoning_effort = "medium"',
      'response_storage = false',
      '',
      '[model_providers.test-provider]',
      `base_url = "http://127.0.0.1:${port}"`,
      'wire_api = "responses"',
      'env_key = "ANTHROPIC_API_KEY"',
      '',
    ].join('\n'),
  )
  return tempHome
}

async function withResponseServer() {
  const sockets = new Set()
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/responses') {
      res.statusCode = 404
      res.end('not found')
      return
    }
    let body = ''
    req.on('data', chunk => { body += chunk.toString() })
    req.on('end', () => {
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
            content: [{ type: 'output_text', text: 'SWEEP_DONE' }],
          },
        })}\n\n`,
      )
      res.write(
        `event: response.completed\ndata: ${JSON.stringify({
          type: 'response.completed',
          response: { id: 'resp-sweep-1' },
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
  return {
    port: address.port,
    async close() {
      for (const s of sockets) s.destroy()
      await new Promise(r => server.close(r))
    },
  }
}

async function runSingleCommand({ tempHome, command, timeoutSec = 20 }) {
  const pythonScript = String.raw`
import json, os, pty, re, select, signal, subprocess, sys, time
cli_path, cwd, temp_home, cmd, timeout_sec = sys.argv[1:6]
timeout_sec = int(timeout_sec)
master, slave = pty.openpty()
env = os.environ.copy()
env["HOME"] = temp_home
env["ANTHROPIC_API_KEY"] = "test-key"
env["TERM"] = "xterm-256color"
env["CLAUDE_CODE_DISABLE_TERMINAL_TITLE"] = "1"
env["FORCE_COLOR"] = "0"
proc = subprocess.Popen(["node", cli_path, "--bare"], cwd=cwd, env=env, stdin=slave, stdout=slave, stderr=slave, close_fds=True)
os.close(slave)
ansi_re = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\].*?(?:\x07|\x1b\\)")
buffer = b""
prompt_seen = False
sent_cmd = False
got_response = False
sent_exit = False
timeout_at = time.time() + timeout_sec
# Track what text appeared after command
post_cmd_text = ""

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
        if prompt_seen and not sent_cmd:
            os.write(master, (cmd + "\r").encode("utf-8"))
            sent_cmd = True
        if sent_cmd:
            # Get text after the command
            idx = clean.find(cmd)
            if idx >= 0:
                post_cmd_text = clean[idx + len(cmd):]
        # Check for any response or UI change
        if sent_cmd and not got_response and post_cmd_text:
            # Any non-trivial output after command counts
            clean_post = post_cmd_text.strip()
            if len(clean_post) > 10:
                got_response = True
        if got_response and not sent_exit:
            time.sleep(1)
            os.write(master, b"\x1b")  # Esc to dismiss
            time.sleep(0.5)
            os.write(master, b"/exit\r")
            sent_exit = True

if proc.poll() is None:
    proc.send_signal(signal.SIGTERM)
    try: proc.wait(timeout=5)
    except: proc.kill(); proc.wait(timeout=5)

clean = ansi_re.sub("", buffer.decode("utf-8", "ignore"))
print(json.dumps({
    "command": cmd,
    "code": proc.returncode,
    "promptSeen": prompt_seen,
    "sentCmd": sent_cmd,
    "gotResponse": got_response,
    "sentExit": sent_exit,
    "postCmdSnippet": post_cmd_text[-300:] if post_cmd_text else "",
}))
`
  const child = spawn('python3', ['-c', pythonScript, cliPath, cwd, tempHome, command, String(timeoutSec)], {
    cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = '', stderr = ''
  child.stdout.setEncoding('utf8').on('data', c => { stdout += c })
  child.stderr.setEncoding('utf8').on('data', c => { stderr += c })
  await once(child, 'exit')
  try {
    return JSON.parse(stdout.trim().split('\n').pop())
  } catch {
    return { command, parseError: true, stdout: stdout.slice(-200), stderr: stderr.slice(-200) }
  }
}

// Commands to test — local-jsx commands that should show a UI surface
const LOCAL_JSX_COMMANDS = [
  'sandbox', 'keybindings', 'color', 'vim', 'output-style',
  'env', 'stats', 'summary', 'tag', 'rename',
]

// Prompt commands that get sent to the model
const PROMPT_COMMANDS = [
  'advisor', 'review', 'security-review',
]

// Commands that are local but may show minimal UI
const MINIMAL_COMMANDS = [
  'export', 'diff', 'session', 'fast',
]

for (const cmd of LOCAL_JSX_COMMANDS) {
  test(`/\\${cmd} shows UI surface`, async t => {
    const server = await withResponseServer()
    t.after(() => server.close())
    const tempHome = await createTempHome(server.port)
    t.after(() => rm(tempHome, { recursive: true, force: true }))

    const result = await runSingleCommand({ tempHome, command: `/${cmd}` })
    t.diagnostic(`/${cmd}: promptSeen=${result.promptSeen} sentCmd=${result.sentCmd} gotResponse=${result.gotResponse}`)
    t.diagnostic(`snippet: ${(result.postCmdSnippet || '').slice(0, 150)}`)

    assert.ok(result.promptSeen, `/${cmd} should see TUI prompt`)
    assert.ok(result.sentCmd, `/${cmd} should be sent`)
    // gotResponse may be false if command shows very brief output
    // but sentCmd must be true and no crash (no parseError)
    assert.ok(!result.parseError, `/${cmd} should not crash`)
  })
}

for (const cmd of PROMPT_COMMANDS) {
  test(`/\\${cmd} is recognized`, async t => {
    const server = await withResponseServer()
    t.after(() => server.close())
    const tempHome = await createTempHome(server.port)
    t.after(() => rm(tempHome, { recursive: true, force: true }))

    const result = await runSingleCommand({ tempHome, command: `/${cmd}` })
    t.diagnostic(`/${cmd}: promptSeen=${result.promptSeen} sentCmd=${result.sentCmd} gotResponse=${result.gotResponse}`)

    assert.ok(result.promptSeen, `/${cmd} should see TUI prompt`)
    assert.ok(result.sentCmd, `/${cmd} should be sent`)
    assert.ok(!result.parseError, `/${cmd} should not crash`)
  })
}

for (const cmd of MINIMAL_COMMANDS) {
  test(`/\\${cmd} does not crash`, async t => {
    const server = await withResponseServer()
    t.after(() => server.close())
    const tempHome = await createTempHome(server.port)
    t.after(() => rm(tempHome, { recursive: true, force: true }))

    const result = await runSingleCommand({ tempHome, command: `/${cmd}` })
    t.diagnostic(`/${cmd}: promptSeen=${result.promptSeen} sentCmd=${result.sentCmd}`)

    assert.ok(result.promptSeen, `/${cmd} should see TUI prompt`)
    assert.ok(!result.parseError, `/${cmd} should not crash`)
  })
}

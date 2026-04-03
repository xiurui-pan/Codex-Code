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
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-code-tui-home-'))
  const codexDir = join(tempHome, '.codex')
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
  )
  return tempHome
}

async function withResponseServer() {
  const requestBodies = []
  const sockets = new Set()
  const responseText = 'TUI_SMOKE_DONE'
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
            content: [{ type: 'output_text', text: responseText }],
          },
        })}\n\n`,
      )
      res.write(
        `event: response.completed\ndata: ${JSON.stringify({
          type: 'response.completed',
          response: { id: 'resp-tui-smoke-1' },
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
    throw new Error('failed to bind test server')
  }

  return {
    port: address.port,
    requestBodies,
    responseText,
    async close() {
      for (const socket of sockets) {
        socket.destroy()
      }
      await new Promise(resolve => server.close(resolve))
    },
  }
}

async function runTuiSession({ tempHome, promptText, expectedReply }) {
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

cli_path, cwd, temp_home, prompt_text, expected_reply = sys.argv[1:6]
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
prompt_seen = False
sent_prompt = False
sent_exit = False
timeout_at = time.time() + 45

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
        if prompt_seen and not sent_prompt:
            os.write(master, (prompt_text + "\r").encode("utf-8"))
            sent_prompt = True
        if sent_prompt and not sent_exit and expected_reply in clean:
            os.write(master, b"/exit\r")
            sent_exit = True

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
    "sentPrompt": sent_prompt,
    "sentExit": sent_exit,
    "cleanedTranscript": clean,
}
print(json.dumps(result))
`

  const child = spawn(
    'python3',
    ['-c', pythonScript, cliPath, cwd, tempHome, promptText, expectedReply],
    {
      cwd,
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
          new Error(`tui smoke timed out\nstdout=${stdout}\nstderr=${stderr}`),
        )
      }, 50000)
    }),
  ])

  assert.equal(code, 0, stderr || `python driver exited with ${code}`)
  return JSON.parse(stdout)
}

test('interactive TTY can start, show a prompt, answer once, and exit cleanly', async () => {
  const server = await withResponseServer()
  const tempHome = await createTempHome(server.port)
  const promptText = 'Please reply with TUI_SMOKE_DONE only.'
  try {
    const result = await runTuiSession({
      tempHome,
      promptText,
      expectedReply: server.responseText,
    })

    assert.equal(result.code, 0)
    assert.equal(result.promptSeen, true)
    assert.equal(result.sentPrompt, true)
    assert.equal(result.sentExit, true)
    assert.match(result.cleanedTranscript, /Codex\s*Code/)
    assert.match(result.cleanedTranscript, /TUI_SMOKE_DONE/)
    assert.ok(server.requestBodies.length >= 1)
    assert.match(JSON.stringify(server.requestBodies.at(-1)), /TUI_SMOKE_DONE/)
  } finally {
    await server.close()
    await rm(tempHome, { recursive: true, force: true })
  }
})

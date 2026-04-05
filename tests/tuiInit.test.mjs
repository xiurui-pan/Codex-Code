/**
 * Real PTY test for /init command.
 *
 * Verifies that /init in the TUI:
 * 1. Starts analyzing the codebase
 * 2. Produces output (model response or tool calls)
 * 3. Completes or enters work state within the timeout
 *
 * Uses the same mock HTTP server + Python PTY pattern as tuiSmoke.smoke.mjs.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

const cwd = projectRoot
const cliPath = join(cwd, 'dist/cli.js')

async function createTempHome(port) {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-code-init-test-'))
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
  const requestBodies = []
  const sockets = new Set()

  // Simulate a model that responds to the /init prompt by saying it will analyze the codebase
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

      // Send a simulated assistant response that looks like an /init analysis
      const responseText = `I'll analyze the codebase and create a CLAUDE.md file.

## Project Overview

This is a test project. Build commands: \`npm install && npm test\`.

INIT_TEST_DONE`

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
          response: { id: 'resp-init-test-1' },
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
    async close() {
      for (const socket of sockets) {
        socket.destroy()
      }
      await new Promise(resolve => server.close(resolve))
    },
  }
}

async function runTuiInit({ tempHome }) {
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
master, slave = pty.openpty()
env = os.environ.copy()
env["HOME"] = temp_home
env["ANTHROPIC_API_KEY"] = "test-key"
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
init_done_seen = False
sent_exit = False
timeout_at = time.time() + 30

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
        if sent_init and not sent_exit and "INIT_TEST_DONE" in clean:
            init_done_seen = True
            os.write(master, b"/exit\r")
            sent_exit = True
        # Also exit if we see "analyzing" which means the prompt was processed
        if sent_init and not sent_exit and ("analyzing" in clean.lower() or "CLAUDE.md" in clean):
            # Wait a bit more for full response
            pass

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
    "initDoneSeen": init_done_seen,
    "sentExit": sent_exit,
    "cleanedTranscript": clean,
}
print(json.dumps(result))
`

  const child = spawn(
    'python3',
    ['-c', pythonScript, cliPath, cwd, tempHome],
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

  const [exitCode] = await once(child, 'exit')
  return { stdout, stderr, exitCode }
}

test('TUI /init command with mock provider', async t => {
  const server = await withResponseServer()
  t.after(() => server.close())
  const tempHome = await createTempHome(server.port)
  t.after(() => rm(tempHome, { recursive: true, force: true }))

  const result = await runTuiInit({ tempHome })

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
    initDoneSeen: parsed.initDoneSeen,
    sentExit: parsed.sentExit,
  })

  // Print relevant parts of the transcript for debugging
  const transcript = parsed.cleanedTranscript || ''
  console.log('\nTranscript excerpt (last 500 chars):')
  console.log(transcript.slice(-500))

  assert.ok(parsed.promptSeen, 'TUI prompt should appear')
  assert.ok(parsed.sentInit, '/init should have been sent')
  assert.ok(parsed.initDoneSeen, 'Mock response INIT_TEST_DONE should appear in output')
})

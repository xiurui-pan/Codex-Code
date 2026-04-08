import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

const cliCwd = projectRoot

async function runHeadlessContextSession({
  projectFiles,
  prompt,
  extraArgs = [],
  envOverrides = {},
}) {
  const seenRequestBodies = []
  const sockets = new Set()
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-context-home-'))
  const projectDir = await mkdtemp(join(tmpdir(), 'codex-context-project-'))
  const codexDir = join(tempHome, '.codex')
  await mkdir(codexDir, { recursive: true })

  for (const [relativePath, content] of Object.entries(projectFiles)) {
    const absolutePath = join(projectDir, relativePath)
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, content)
  }

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
      seenRequestBodies.push(JSON.parse(body))
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        connection: 'keep-alive',
        'cache-control': 'no-cache',
      })
      res.write(
        'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"context ok"}]}}\n\n',
      )
      res.write(
        'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-context-1"}}\n\n',
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

  await writeFile(
    join(codexDir, 'config.toml'),
    [
      'model_provider = "test-provider"',
      'model = "gpt-5.1-codex-mini"',
      'model_reasoning_effort = "medium"',
      'response_storage = false',
      '',
      '[model_providers.test-provider]',
      `base_url = "http://127.0.0.1:${address.port}"`,
      'env_key = "ANTHROPIC_API_KEY"',
      '',
    ].join('\n'),
  )

  const child = spawn(
    'node',
    [
      'dist/cli.js',
      '-p',
      '--bare',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--permission-prompt-tool',
      'stdio',
      '--verbose',
      '--debug-to-stderr',
      ...(typeof extraArgs === 'function' ? extraArgs(projectDir) : extraArgs),
    ],
    {
      cwd: cliCwd,
      env: {
        ...process.env,
        HOME: tempHome,
        ANTHROPIC_API_KEY: 'test-key',
        ...envOverrides,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )

  const stdoutLines = []
  let stdoutBuffer = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    stdoutBuffer += chunk
    let newlineIndex = stdoutBuffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim()
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
      if (line) {
        stdoutLines.push(line)
        const parsed = JSON.parse(line)
        if (
          parsed.type === 'control_request' &&
          parsed.request?.subtype === 'can_use_tool'
        ) {
          child.stdin.write(
            JSON.stringify({
              type: 'control_response',
              response: {
                subtype: 'success',
                request_id: parsed.request_id,
                response: {
                  behavior: 'allow',
                  updatedInput: parsed.request.input,
                },
              },
            }) + '\n',
          )
        }
        if (parsed.type === 'result' && !child.stdin.destroyed) {
          child.stdin.end()
        }
      }
      newlineIndex = stdoutBuffer.indexOf('\n')
    }
  })

  const stderrChunks = []
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => stderrChunks.push(chunk))

  child.stdin.write(
    JSON.stringify({
      type: 'control_request',
      request_id: 'init-1',
      request: {
        subtype: 'initialize',
        promptSuggestions: false,
      },
    }) + '\n',
  )
  child.stdin.write(
    JSON.stringify({
      type: 'user',
      session_id: '',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: typeof prompt === 'function' ? prompt(projectDir) : prompt,
      },
      uuid: 'user-1',
    }) + '\n',
  )

  let code
  try {
    const [exitCode] = await Promise.race([
      once(child, 'close'),
      new Promise((_, reject) => {
        setTimeout(() => {
          child.kill('SIGKILL')
          reject(
            new Error(
              `context smoke timed out\nstdout=${stdoutLines.join('\n')}\nstderr=${stderrChunks.join('')}`,
            ),
          )
        }, 45000)
      }),
    ])
    code = exitCode
  } finally {
    for (const socket of sockets) {
      socket.destroy()
    }
    await new Promise(resolve => server.close(resolve))
    await rm(tempHome, { recursive: true, force: true })
    await rm(projectDir, { recursive: true, force: true })
  }

  return {
    code,
    requestBodies: seenRequestBodies,
    messages: stdoutLines.map(line => JSON.parse(line)),
    stderr: stderrChunks.join(''),
    projectDir,
  }
}

// These tests pin the current Codex-only behavior on local context entrypoints.
// They should be folded into the broader TUI command/interaction matrix later,
// so the same scenarios are checked at the input, display, cancel, and
// error-reporting layers as well.

test('当前 headless Codex 主链会把 --add-dir 下 CLAUDE.md 与同目录导入内容一起注入请求体', async () => {
  const result = await runHeadlessContextSession({
    projectFiles: {
      'CLAUDE.md':
        'Project rule: ALWAYS mention ALPHA_CONTEXT.\n@./imported.md\n',
      'imported.md': 'Imported rule: INCLUDE_BETA_CONTEXT.\n',
    },
    prompt: '请总结当前上下文。',
    extraArgs: projectDir => ['--add-dir', projectDir],
    envOverrides: {
      CODEX_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
    },
  })

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.requestBodies.length > 0, true, result.stderr)
  const payload = JSON.stringify(result.requestBodies[0] ?? {})
  assert.match(payload, /ALPHA_CONTEXT/)
  assert.match(payload, /INCLUDE_BETA_CONTEXT/)
  assert.match(payload, /请总结当前上下文/)
})

test('当前 headless Codex 主链会把显式 @文件引用内容带进请求体', async () => {
  const projectFiles = {
    'note.txt': 'Referenced file says GAMMA_FILE_CONTEXT.\n',
  }
  const result = await runHeadlessContextSession({
    projectFiles,
    prompt: projectDir => `请读取 @"${join(projectDir, 'note.txt')}" 并总结。`,
  })

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.requestBodies.length > 0, true, result.stderr)
  const payload = JSON.stringify(result.requestBodies[0] ?? {})
  assert.match(payload, /GAMMA_FILE_CONTEXT/)
  assert.match(payload, /note\.txt/)
})

test('当前 Codex 主链会把 CLAUDE.md 里的 @import 内容一起注入请求体', async () => {
  const result = await runHeadlessContextSession({
    projectFiles: {
      'CLAUDE.md':
        'Project rule: KEEP_DELTA_CONTEXT.\n@import ./imported.md\n',
      'imported.md': 'SHOULD_NOT_BE_IMPORTED_BY_LITERAL_AT_IMPORT.\n',
    },
    prompt: '请总结当前上下文。',
    extraArgs: projectDir => ['--add-dir', projectDir],
    envOverrides: {
      CODEX_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
    },
  })

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.requestBodies.length > 0, true, result.stderr)
  const payload = JSON.stringify(result.requestBodies[0] ?? {})
  assert.match(payload, /KEEP_DELTA_CONTEXT/)
  assert.match(payload, /SHOULD_NOT_BE_IMPORTED_BY_LITERAL_AT_IMPORT/)
})

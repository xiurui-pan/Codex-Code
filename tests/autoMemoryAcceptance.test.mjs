import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { projectRoot } from './helpers/projectRoot.mjs'

const CLI_CWD = projectRoot
const CLI_PATH = join(CLI_CWD, 'dist/cli.js')
const SERIAL_TEST = { concurrency: false }
const DEFAULT_CONFIG_LINES = [
  'model_provider = "test-provider"',
  'model = "gpt-5.1-codex-mini"',
  'model_reasoning_effort = "medium"',
  'response_storage = false',
]

function sanitizePath(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '-')
}

function resolveAutoMemoryProjectKey(projectDir) {
  try {
    const gitRoot = execFileSync(
      'git',
      ['-C', projectDir, 'rev-parse', '--show-toplevel'],
      { encoding: 'utf8' },
    ).trim()
    return gitRoot || projectDir
  } catch {
    return projectDir
  }
}

function getDefaultAutoMemoryEntrypoint(homeDir, projectDir) {
  return join(
    homeDir,
    '.claude',
    'projects',
    sanitizePath(resolveAutoMemoryProjectKey(projectDir)),
    'memory',
    'MEMORY.md',
  )
}

async function withResponsesServer(fn) {
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
        'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"memory ok"}]}}\n\n',
      )
      res.write(
        'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-memory-1"}}\n\n',
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
    throw new Error('failed to bind auto-memory acceptance server')
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

async function runHeadlessPrompt({
  projectDir,
  tempHome,
  envOverrides = {},
  prompt,
}) {
  return withResponsesServer(async ({ port, requestBodies }) => {
    await writeCodexConfig(tempHome, port)

    const child = spawn(
      'node',
      [
        CLI_PATH,
        '-p',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--verbose',
        '--debug-to-stderr',
      ],
      {
        cwd: projectDir,
        env: {
          ...process.env,
          HOME: tempHome,
          CLAUDE_CONFIG_DIR: join(tempHome, '.claude'),
          ANTHROPIC_API_KEY: 'test-key',
          CODEX_CODE_USE_CODEX_PROVIDER: '1',
          ...envOverrides,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )

    const stdoutMessages = []
    let stdoutBuffer = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdoutBuffer += chunk
      let newlineIndex = stdoutBuffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim()
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
        if (line) {
          const parsed = JSON.parse(line)
          stdoutMessages.push(parsed)
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
        request: { subtype: 'initialize', promptSuggestions: false },
      }) + '\n',
    )
    child.stdin.write(
      JSON.stringify({
        type: 'user',
        session_id: '',
        parent_tool_use_id: null,
        message: { role: 'user', content: prompt },
        uuid: 'user-1',
      }) + '\n',
    )

    const [code] = await Promise.race([
      once(child, 'close'),
      new Promise((_, reject) => {
        setTimeout(() => {
          child.kill('SIGKILL')
          reject(
            new Error(
              `auto-memory acceptance timed out\nstdout=${stdoutMessages.map(message => JSON.stringify(message)).join('\n')}\nstderr=${stderrChunks.join('')}`,
            ),
          )
        }, 45000)
      }),
    ])

    return {
      code,
      requestBodies,
      stderr: stderrChunks.join(''),
    }
  })
}

function getInstructionsText(requestBody) {
  return typeof requestBody?.instructions === 'string'
    ? requestBody.instructions
    : ''
}

function getInputText(requestBody) {
  const items = Array.isArray(requestBody?.input) ? requestBody.input : []
  return items
    .flatMap(item => {
      const content = Array.isArray(item?.content) ? item.content : []
      return content
        .map(block => {
          if (typeof block?.text === 'string') {
            return block.text
          }
          return ''
        })
        .filter(Boolean)
    })
    .join('\n')
}

test(
  'Codex headless injects default auto-memory MEMORY.md into the real request body',
  SERIAL_TEST,
  async () => {
    const projectDir = await mkdtemp(
      join(CLI_CWD, '.tmp-codex-automemory-project-'),
    )
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-automemory-home-'))
    try {
      const defaultEntry = getDefaultAutoMemoryEntrypoint(tempHome, projectDir)
      await mkdir(dirname(defaultEntry), { recursive: true })
      await writeFile(
        defaultEntry,
        '- [Alpha memory](alpha.md) — AUTO_MEMORY_SENTINEL_ALPHA\n',
        'utf8',
      )

      const result = await runHeadlessPrompt({
        projectDir,
        tempHome,
        prompt: '请总结当前长期记忆。',
      })

      assert.equal(result.code, 0, result.stderr)
      assert.equal(result.requestBodies.length, 1, result.stderr)
      const requestBody = result.requestBodies[0] ?? {}
      const instructions = getInstructionsText(requestBody)
      const inputText = getInputText(requestBody)
      assert.ok(instructions.length > 0, JSON.stringify(requestBody))
      assert.match(instructions, /persistent, file-based memory system/i)
      assert.match(instructions, /MEMORY\.md/)
      assert.match(inputText, /AUTO_MEMORY_SENTINEL_ALPHA/)
      assert.match(inputText, /请总结当前长期记忆/)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
      await rm(projectDir, { recursive: true, force: true })
    }
  },
)

test(
  'Codex headless prefers CLAUDE_COWORK_MEMORY_PATH_OVERRIDE over the default project memory directory',
  SERIAL_TEST,
  async () => {
    const projectDir = await mkdtemp(
      join(CLI_CWD, '.tmp-codex-automemory-override-project-'),
    )
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-automemory-override-home-'))
    try {
      const defaultEntry = getDefaultAutoMemoryEntrypoint(tempHome, projectDir)
      const overrideDir = join(tempHome, '.cowork-memory')
      const overrideEntry = join(overrideDir, 'MEMORY.md')

      await mkdir(dirname(defaultEntry), { recursive: true })
      await writeFile(
        defaultEntry,
        '- [Default memory](default.md) — DEFAULT_MEMORY_SHOULD_NOT_WIN\n',
        'utf8',
      )
      await mkdir(dirname(overrideEntry), { recursive: true })
      await writeFile(
        overrideEntry,
        '- [Override memory](override.md) — OVERRIDE_MEMORY_SENTINEL\n',
        'utf8',
      )

      const result = await runHeadlessPrompt({
        projectDir,
        tempHome,
        envOverrides: {
          CLAUDE_COWORK_MEMORY_PATH_OVERRIDE: overrideDir,
        },
        prompt: '请只总结当前 override 记忆。',
      })

      assert.equal(result.code, 0, result.stderr)
      assert.equal(result.requestBodies.length, 1, result.stderr)
      const requestBody = result.requestBodies[0] ?? {}
      const instructions = getInstructionsText(requestBody)
      const inputText = getInputText(requestBody)
      assert.ok(instructions.length > 0, JSON.stringify(requestBody))
      assert.match(inputText, /OVERRIDE_MEMORY_SENTINEL/)
      assert.doesNotMatch(inputText, /DEFAULT_MEMORY_SHOULD_NOT_WIN/)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
      await rm(projectDir, { recursive: true, force: true })
    }
  },
)

test(
  'Codex headless keeps auto-memory prompt injection scoped and respects explicit disable',
  SERIAL_TEST,
  async () => {
    const projectDir = await mkdtemp(
      join(CLI_CWD, '.tmp-codex-automemory-disabled-project-'),
    )
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-automemory-disabled-home-'))
    try {
      const defaultEntry = getDefaultAutoMemoryEntrypoint(tempHome, projectDir)
      await mkdir(dirname(defaultEntry), { recursive: true })
      await writeFile(
        defaultEntry,
        '- [Scoped memory](scoped.md) — AUTO_MEMORY_SHOULD_BE_DISABLED\n',
        'utf8',
      )

      const result = await runHeadlessPrompt({
        projectDir,
        tempHome,
        envOverrides: {
          CODEX_CODE_DISABLE_AUTO_MEMORY: '1',
        },
        prompt: '请检查长期记忆是否启用。',
      })

      assert.equal(result.code, 0, result.stderr)
      assert.equal(result.requestBodies.length, 1, result.stderr)
      const requestBody = result.requestBodies[0] ?? {}
      const instructions = getInstructionsText(requestBody)
      const inputText = getInputText(requestBody)
      assert.doesNotMatch(instructions, /AUTO_MEMORY_SHOULD_BE_DISABLED/)
      assert.doesNotMatch(instructions, /persistent, file-based memory system/i)
      assert.doesNotMatch(inputText, /AUTO_MEMORY_SHOULD_BE_DISABLED/)
      assert.match(inputText, /请检查长期记忆是否启用。/)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
      await rm(projectDir, { recursive: true, force: true })
    }
  },
)

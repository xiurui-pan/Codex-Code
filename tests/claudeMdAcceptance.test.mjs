import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
        'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"claude md ok"}]}}\n\n',
      )
      res.write(
        'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-claudemd-1"}}\n\n',
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
    throw new Error('failed to bind claudemd acceptance server')
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
          CODEX_CODE_SIMPLE: '',
          CODEX_CODE_DISABLE_ATTACHMENTS: '',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )

    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk
      if (stdout.includes('"type":"result"') && !child.stdin.destroyed) {
        child.stdin.end()
      }
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })

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
              `claudemd acceptance timed out\nstdout=${stdout}\nstderr=${stderr}`,
            ),
          )
        }, 45000)
      }),
    ])

    return { code, requestBodies, stderr }
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
  'Codex headless injects project CLAUDE.md content into the real request body',
  SERIAL_TEST,
  async () => {
    const projectDir = await mkdtemp(join(CLI_CWD, '.tmp-codex-claudemd-project-'))
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-claudemd-home-'))
    try {
      await writeFile(
        join(projectDir, 'CLAUDE.md'),
        '# Project rules\nPROJECT_CLAUDE_SENTINEL_BRAVO\n',
        'utf8',
      )

      const result = await runHeadlessPrompt({
        projectDir,
        tempHome,
        prompt: '请总结当前项目说明。',
      })

      assert.equal(result.code, 0, result.stderr)
      assert.equal(result.requestBodies.length > 0, true, result.stderr)
      const requestBody = result.requestBodies[0] ?? {}
      const instructions = getInstructionsText(requestBody)
      const inputText = getInputText(requestBody)
      assert.ok(instructions.length > 0, JSON.stringify(requestBody))
      assert.match(inputText, /PROJECT_CLAUDE_SENTINEL_BRAVO/)
      assert.match(inputText, /Contents of .*CLAUDE\.md/)
      assert.match(inputText, /请总结当前项目说明/)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
      await rm(projectDir, { recursive: true, force: true })
    }
  },
)

test(
  'Codex headless injects @import content from CLAUDE.md into the real request body',
  SERIAL_TEST,
  async () => {
    const projectDir = await mkdtemp(join(CLI_CWD, '.tmp-codex-claudemd-import-project-'))
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-claudemd-import-home-'))
    try {
      await mkdir(join(projectDir, 'notes'), { recursive: true })
      await writeFile(
        join(projectDir, 'CLAUDE.md'),
        '# Project rules\nPROJECT_RULE_SENTINEL_BASE\n@./notes/imported.md\n',
        'utf8',
      )
      await writeFile(
        join(projectDir, 'notes', 'imported.md'),
        'IMPORTED_RULE_SENTINEL_CHARLIE\n',
        'utf8',
      )

      const result = await runHeadlessPrompt({
        projectDir,
        tempHome,
        prompt: '请总结当前导入说明。',
      })

      assert.equal(result.code, 0, result.stderr)
      assert.equal(result.requestBodies.length > 0, true, result.stderr)
      const requestBody = result.requestBodies[0] ?? {}
      const instructions = getInstructionsText(requestBody)
      const inputText = getInputText(requestBody)
      assert.ok(instructions.length > 0, JSON.stringify(requestBody))
      assert.match(inputText, /PROJECT_RULE_SENTINEL_BASE/)
      assert.match(inputText, /IMPORTED_RULE_SENTINEL_CHARLIE/)
      assert.match(inputText, /notes\/imported\.md|notes\\\\imported\.md/)
      assert.match(inputText, /请总结当前导入说明/)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
      await rm(projectDir, { recursive: true, force: true })
    }
  },
)

test(
  'Codex headless injects literal @import directives from CLAUDE.md into the real request body',
  SERIAL_TEST,
  async () => {
    const projectDir = await mkdtemp(join(CLI_CWD, '.tmp-codex-claudemd-import-literal-project-'))
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-claudemd-import-literal-home-'))
    try {
      await mkdir(join(projectDir, 'notes'), { recursive: true })
      await writeFile(
        join(projectDir, 'CLAUDE.md'),
        '# Project rules\nPROJECT_RULE_SENTINEL_ECHO\n@import ./notes/imported.md\n',
        'utf8',
      )
      await writeFile(
        join(projectDir, 'notes', 'imported.md'),
        'IMPORTED_RULE_SENTINEL_FOXTROT\n',
        'utf8',
      )

      const result = await runHeadlessPrompt({
        projectDir,
        tempHome,
        prompt: '请总结当前导入说明。',
      })

      assert.equal(result.code, 0, result.stderr)
      assert.equal(result.requestBodies.length > 0, true, result.stderr)
      const requestBody = result.requestBodies[0] ?? {}
      const instructions = getInstructionsText(requestBody)
      const inputText = getInputText(requestBody)
      assert.ok(instructions.length > 0, JSON.stringify(requestBody))
      assert.match(inputText, /PROJECT_RULE_SENTINEL_ECHO/)
      assert.match(inputText, /IMPORTED_RULE_SENTINEL_FOXTROT/)
      assert.match(inputText, /notes\/imported\.md|notes\\\\imported\.md/)
      assert.match(inputText, /请总结当前导入说明/)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
      await rm(projectDir, { recursive: true, force: true })
    }
  },
)

test(
  'Codex headless injects @文件引用 content into the real request body',
  SERIAL_TEST,
  async () => {
    const projectDir = await mkdtemp(join(CLI_CWD, '.tmp-codex-file-ref-project-'))
    const tempHome = await mkdtemp(join(tmpdir(), 'codex-file-ref-home-'))
    try {
      const notePath = join(projectDir, 'note.txt')
      await writeFile(
        notePath,
        'FILE_REFERENCE_SENTINEL_DELTA\n',
        'utf8',
      )

      const result = await runHeadlessPrompt({
        projectDir,
        tempHome,
        prompt: `请读取 @"${notePath}" 并总结。`,
      })

      assert.equal(result.code, 0, result.stderr)
      assert.equal(result.requestBodies.length > 0, true, result.stderr)
      const requestBody = result.requestBodies[0] ?? {}
      const inputText = getInputText(requestBody)
      assert.match(inputText, /FILE_REFERENCE_SENTINEL_DELTA/)
      assert.match(inputText, /Called the Read tool with the following input: .*note\.txt/)
      assert.match(inputText, /Result of calling the Read tool:/)
      assert.match(inputText, /请读取/)
    } finally {
      await rm(tempHome, { recursive: true, force: true })
      await rm(projectDir, { recursive: true, force: true })
    }
  },
)

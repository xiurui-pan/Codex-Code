import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function runHeadlessSession(options: {
  responseBlocks: string[]
  prompt: string
  permissionDecision?: 'allow' | 'deny'
}) {
  let seenRequestBody: unknown = null
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-code-test-home-'))
  const sockets = new Set<import('node:net').Socket>()

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
      seenRequestBody = JSON.parse(body)
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        connection: 'keep-alive',
        'cache-control': 'no-cache',
      })
      for (const block of options.responseBlocks) {
        res.write(block)
      }
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

  const child = spawn(
    'node',
    [
      'dist/cli.js',
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: tempHome,
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}`,
        ANTHROPIC_API_KEY: 'test-key',
        ANTHROPIC_MODEL: 'gpt-5.1-codex-mini',
        CLAUDE_CODE_USE_CODEX_PROVIDER: '1',
        CLAUDE_CODE_EFFORT_LEVEL: 'medium',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )

  const stdoutLines: string[] = []
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
          parsed.type === 'control_response' &&
          parsed.response?.request_id === 'init-1'
        ) {
          child.stdin.write(
            JSON.stringify({
              type: 'user',
              message: { role: 'user', content: options.prompt },
              uuid: 'user-1',
            }) + '\n',
          )
        }
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
                  behavior: options.permissionDecision ?? 'allow',
                  updatedInput: parsed.request.input,
                  message:
                    options.permissionDecision === 'deny'
                      ? 'denied by test'
                      : undefined,
                },
              },
            }) + '\n',
          )
        }
      }
      newlineIndex = stdoutBuffer.indexOf('\n')
    }
  })

  const stderrChunks: string[] = []
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => stderrChunks.push(chunk))

  child.stdin.write(
    JSON.stringify({
      type: 'control_request',
      request_id: 'init-1',
      request: { subtype: 'initialize', cwd: process.cwd(), tools: [] },
    }) + '\n',
  )

  const timeout = setTimeout(() => {
    child.kill('SIGKILL')
  }, 30000)
  const [code] = (await once(child, 'close')) as [number]
  clearTimeout(timeout)
  for (const socket of sockets) {
    socket.destroy()
  }
  await new Promise(resolve => server.close(resolve))
  await rm(tempHome, { recursive: true, force: true })

  return {
    code,
    requestBody: seenRequestBody as Record<string, unknown> | null,
    messages: stdoutLines.map(line => JSON.parse(line)),
    stderr: stderrChunks.join(''),
  }
}

test('headless path sends codex request shape and emits incremental execution items', async () => {
  const result = await runHeadlessSession({
    prompt: '请运行 pwd',
    responseBlocks: [
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"tool-1","name":"Bash","arguments":"{\\"command\\":\\"pwd\\"}"}}\n\n',
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"done"}]}}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-1"}}\n\n',
      'data: [DONE]\n\n',
    ],
  })

  assert.equal(result.code, 0)
  assert.equal(result.requestBody?.model, 'gpt-5.1-codex-mini')
  assert.equal(result.requestBody?.stream, true)
  assert.equal(result.requestBody?.tool_choice, 'auto')
  assert.equal(result.requestBody?.reasoning?.effort, 'medium')
  assert.equal(Array.isArray(result.requestBody?.input), true)

  const itemKinds = result.messages
    .filter(message => message.type === 'system' && message.subtype === 'model_turn_item')
    .map(message => message.item_kind)
  assert.equal(itemKinds.includes('local_shell_call'), true)
  assert.equal(itemKinds.includes('tool_output'), true)
  assert.equal(itemKinds.includes('execution_result'), true)
  assert.equal(
    result.messages.some(
      message => message.type === 'assistant' && message.message?.content?.[0]?.text === 'done',
    ),
    true,
  )
})

test('headless path emits permission decision item on deny', async () => {
  const result = await runHeadlessSession({
    prompt: '请执行 cd src && echo ok > perm-check.txt',
    permissionDecision: 'deny',
    responseBlocks: [
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"tool-2","name":"Bash","arguments":"{\\"command\\":\\"cd src && echo ok > perm-check.txt\\"}"}}\n\n',
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"denied"}]}}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-2"}}\n\n',
      'data: [DONE]\n\n',
    ],
  })

  assert.equal(result.code, 0)
  const itemKinds = result.messages
    .filter(message => message.type === 'system' && message.subtype === 'model_turn_item')
    .map(message => message.item_kind)
  assert.equal(itemKinds.includes('permission_request'), true)
  assert.equal(itemKinds.includes('permission_decision'), true)
  assert.equal(itemKinds.includes('execution_result'), true)
  assert.equal(
    result.messages.some(
      message =>
        message.type === 'result' &&
        Array.isArray(message.permission_denials) &&
        message.permission_denials.length === 1,
    ),
    true,
  )
})

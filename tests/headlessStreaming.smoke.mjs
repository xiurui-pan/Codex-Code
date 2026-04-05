import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

async function runHeadlessSession(options) {
  const seenRequestBodies = []
  const seenRequestHeaders = []
  const sockets = new Set()
  const sentAt = {}
  const seenAt = {
    firstModelTurnItem: null,
    finalAssistant: null,
    result: null,
    close: null,
    assistantTexts: {},
  }
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-code-smoke-home-'))
  const codexDir = join(tempHome, '.codex')
  await mkdir(codexDir, { recursive: true })

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
    req.on('end', async () => {
      seenRequestHeaders.push(req.headers)
      seenRequestBodies.push(JSON.parse(body))
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        connection: 'keep-alive',
        'cache-control': 'no-cache',
      })
      const requestIndex = seenRequestBodies.length - 1
      const responseSteps =
        options.responseBatches?.[requestIndex] ??
        options.responseBatches?.at(-1) ??
        []
      for (const step of responseSteps) {
        sentAt[step.label] = Date.now()
        res.write(step.block)
        if (step.delayMs && step.delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, step.delayMs))
        }
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
    ],
    {
      cwd: projectRootprojectRoot,
      env: {
        ...process.env,
        HOME: tempHome,
        ANTHROPIC_API_KEY: 'test-key',
        ...options.envOverrides,
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
          seenAt.firstModelTurnItem === null &&
          parsed.type === 'system' &&
          parsed.subtype === 'model_turn_item'
        ) {
          seenAt.firstModelTurnItem = Date.now()
        }
        if (
          seenAt.finalAssistant === null &&
          parsed.type === 'assistant' &&
          Array.isArray(parsed.message?.content) &&
          parsed.message.content.some(
            part => part.type === 'text' && part.text === 'done',
          )
        ) {
          seenAt.finalAssistant = Date.now()
        }
        if (
          parsed.type === 'assistant' &&
          Array.isArray(parsed.message?.content)
        ) {
          for (const part of parsed.message.content) {
            if (part.type !== 'text' || typeof part.text !== 'string') {
              continue
            }
            if (!(part.text in seenAt.assistantTexts)) {
              seenAt.assistantTexts[part.text] = Date.now()
            }
          }
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
        if (parsed.type === 'result' && !child.stdin.destroyed) {
          seenAt.result = Date.now()
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
      message: { role: 'user', content: options.prompt },
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
              `headless smoke timed out\nstdout=${stdoutLines.join('\n')}\nstderr=${stderrChunks.join('')}`,
            ),
          )
        }, 45000)
      }),
    ])
    code = exitCode
    seenAt.close = Date.now()
  } finally {
    for (const socket of sockets) {
      socket.destroy()
    }
    await new Promise(resolve => server.close(resolve))
    await rm(tempHome, { recursive: true, force: true })
  }

  return {
    code,
    requestBodies: seenRequestBodies,
    requestHeaders: seenRequestHeaders,
    messages: stdoutLines.map(line => JSON.parse(line)),
    stderr: stderrChunks.join(''),
    sentAt,
    seenAt,
  }
}

async function runStreamingAssertions() {
  const result = await runHeadlessSession({
    prompt: '请处理这个测试请求。',
    responseBatches: [
      [
        {
          label: 'shell-call',
          block:
            'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"tool-1","name":"Bash","arguments":"{\\"command\\":\\"pwd\\"}"}}\n\n',
          delayMs: 350,
        },
        {
          label: 'completed-call',
          block:
            'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-1"}}\n\n',
        },
        {
          label: 'done-call',
          block: 'data: [DONE]\n\n',
        },
      ],
      [
        {
          label: 'final-message',
          block:
            'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"done"}]}}\n\n',
        },
        {
          label: 'completed-final',
          block:
            'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-2"}}\n\n',
        },
        {
          label: 'done-final',
          block: 'data: [DONE]\n\n',
        },
      ],
    ],
  })

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.requestBodies[0]?.model, 'gpt-5.1-codex-mini')
  assert.equal(result.requestBodies[0]?.stream, true)
  assert.equal('tool_choice' in (result.requestBodies[0] ?? {}), false)
  assert.equal(result.requestBodies[0]?.reasoning?.effort, 'medium')
  assert.equal(result.requestBodies[0]?.store, false)
  assert.equal('metadata' in (result.requestBodies[0] ?? {}), false)
  assert.equal(Array.isArray(result.requestBodies[0]?.input), true)
  assert.equal(
    result.requestBodies[0]?.input?.[0]?.content?.[0]?.text,
    '请处理这个测试请求。',
  )
  assert.equal(result.requestHeaders[0]?.authorization, 'Bearer test-key')
  assert.equal(result.requestHeaders[0]?.['x-app'], 'cli')
  assert.match(result.requestHeaders[0]?.['user-agent'] ?? '', /^claude-code\//)
  assert.equal(
    'x-claude-code-session-id' in (result.requestHeaders[0] ?? {}),
    false,
  )

  const itemKinds = result.messages
    .filter(message => message.type === 'system' && message.subtype === 'model_turn_item')
    .map(message => message.item_kind)
  assert.equal(itemKinds.includes('local_shell_call'), true)
  assert.equal(itemKinds.includes('tool_output'), true)
  assert.equal(itemKinds.includes('execution_result'), true)
  assert.notEqual(result.seenAt.firstModelTurnItem, null)
  assert.notEqual(result.seenAt.finalAssistant, null)
  assert.notEqual(result.sentAt['final-message'], undefined)
  assert.ok(
    Number(result.seenAt.firstModelTurnItem) < Number(result.sentAt['final-message']),
    'model_turn_item should arrive before the server sends the final assistant block',
  )
  assert.ok(
    Number(result.seenAt.firstModelTurnItem) < Number(result.seenAt.finalAssistant),
    'model_turn_item should arrive before the final assistant message is emitted',
  )
  assert.notEqual(result.seenAt.result, null)
  assert.notEqual(result.seenAt.close, null)
  assert.ok(
    Number(result.seenAt.result) <= Number(result.seenAt.close),
    'final result should arrive before process exit',
  )
  assert.ok(
    Number(result.seenAt.close) - Number(result.seenAt.result) < 1500,
    'process should exit shortly after emitting the final result',
  )
  assert.equal(
    result.messages.some(
      message => message.type === 'assistant' && message.message?.content?.[0]?.text === 'done',
    ),
    true,
  )
  assert.equal(
    result.messages.some(
      message =>
        message.type === 'assistant' &&
        Array.isArray(message.message?.content) &&
        message.message.content.some(part => part.type === 'tool_use'),
    ),
    false,
  )
}

async function runSameResponseIncrementalAssertions() {
  const result = await runHeadlessSession({
    prompt: '请处理同响应增量测试。',
    responseBatches: [
      [
        {
          label: 'same-response-first',
          block:
            'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"phase one"}]}}\n\n',
          delayMs: 350,
        },
        {
          label: 'same-response-second',
          block:
            'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"phase two"}]}}\n\n',
        },
        {
          label: 'same-response-completed',
          block:
            'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-same-response"}}\n\n',
        },
        {
          label: 'same-response-done',
          block: 'data: [DONE]\n\n',
        },
      ],
    ],
  })

  assert.equal(result.code, 0, result.stderr)
  assert.notEqual(result.seenAt.assistantTexts['phase one'], undefined)
  assert.notEqual(result.seenAt.assistantTexts['phase two'], undefined)
  assert.notEqual(result.sentAt['same-response-second'], undefined)
  assert.ok(
    Number(result.seenAt.assistantTexts['phase one']) <
      Number(result.sentAt['same-response-second']),
    'first same-response item should arrive before the server sends the second item',
  )
  assert.ok(
    Number(result.seenAt.assistantTexts['phase one']) <
      Number(result.seenAt.assistantTexts['phase two']),
    'same-response items should be observed incrementally in order',
  )
  assert.notEqual(result.seenAt.result, null)
  assert.notEqual(result.seenAt.close, null)
  assert.ok(
    Number(result.seenAt.close) - Number(result.seenAt.result) < 1500,
    'same-response smoke should exit shortly after final result',
  )
}

async function runPermissionAssertions(permissionDecision) {
  const finalText = permissionDecision === 'allow' ? 'allowed' : 'denied'
  const result = await runHeadlessSession({
    prompt: `请继续处理这个权限测试请求（${permissionDecision}）。`,
    permissionDecision,
    responseBatches: [
      [
        {
          label: 'permission-shell-call',
          block:
            'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"tool-2","name":"Bash","arguments":"{\\"command\\":\\"echo denied > /tmp/codex-smoke-deny.txt\\"}"}}\n\n',
        },
        {
          label: 'permission-call-completed',
          block:
            'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-3"}}\n\n',
        },
        {
          label: 'permission-call-done',
          block: 'data: [DONE]\n\n',
        },
      ],
      [
        {
          label: 'permission-final-message',
          block:
            `event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"${finalText}"}]}}\n\n`,
        },
        {
          label: 'permission-final-completed',
          block:
            'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-4"}}\n\n',
        },
        {
          label: 'permission-final-done',
          block: 'data: [DONE]\n\n',
        },
      ],
    ],
  })

  assert.equal(result.code, 0, result.stderr)
  const modelTurnItems = result.messages.filter(
    message => message.type === 'system' && message.subtype === 'model_turn_item',
  )
  const itemKinds = modelTurnItems.map(message => message.item_kind)
  const localShellPhases = modelTurnItems
    .filter(message => message.item_kind === 'local_shell_call')
    .map(message => message.item?.phase)
  assert.deepEqual(localShellPhases, ['requested', 'completed'])
  assert.equal(itemKinds.filter(kind => kind === 'permission_request').length, 1)
  assert.equal(itemKinds.filter(kind => kind === 'permission_decision').length, 1)
  assert.equal(itemKinds.filter(kind => kind === 'tool_output').length, 1)
  assert.equal(itemKinds.filter(kind => kind === 'execution_result').length, 1)
  assert.deepEqual(itemKinds, [
    'local_shell_call',
    'permission_request',
    'permission_decision',
    'tool_output',
    'local_shell_call',
    'execution_result',
  ])
  const permissionDecisionItem = modelTurnItems.find(
    message => message.item_kind === 'permission_decision',
  )
  assert.equal(permissionDecisionItem?.item?.decision, permissionDecision)
  assert.equal(
    permissionDecisionItem?.item?.details?.reason_type,
    'permissionPromptTool',
  )
  assert.equal(
    permissionDecisionItem?.item?.details?.decision_source,
    'permission_prompt_tool',
  )
  assert.equal(
    typeof permissionDecisionItem?.item?.details?.permission_prompt_tool_name,
    'string',
  )
  assert.equal(
    result.messages.some(
      message =>
        message.type === 'control_request' &&
        message.request?.subtype === 'can_use_tool' &&
        message.request?.tool_name === 'Bash',
    ),
    true,
  )
  assert.equal(
    result.messages.some(
      message =>
        message.type === 'result' &&
        Array.isArray(message.permission_denials) &&
        message.permission_denials.length === 1,
    ),
    permissionDecision === 'deny',
  )
}

async function runIdentityEnabledAssertions() {
  const result = await runHeadlessSession({
    prompt: '请处理带请求身份信息的测试请求。',
    envOverrides: {
      CODEX_CODE_CODEX_SEND_REQUEST_IDENTITY: '1',
    },
    responseBatches: [
      [
        {
          label: 'identity-shell-call',
          block:
            'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"tool-id-1","name":"Bash","arguments":"{\\"command\\":\\"pwd\\"}"}}\n\n',
        },
        {
          label: 'identity-call-completed',
          block:
            'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-id-1"}}\n\n',
        },
        {
          label: 'identity-call-done',
          block: 'data: [DONE]\n\n',
        },
      ],
      [
        {
          label: 'identity-final-message',
          block:
            'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"identity enabled"}]}}\n\n',
        },
        {
          label: 'identity-final-completed',
          block:
            'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-id-2"}}\n\n',
        },
        {
          label: 'identity-final-done',
          block: 'data: [DONE]\n\n',
        },
      ],
    ],
  })

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.requestBodies.length >= 2, true)
  assert.equal(
    result.requestHeaders[0]?.['x-claude-code-session-id'],
    result.requestBodies[0]?.metadata?.session_id,
  )
  assert.equal(
    result.requestHeaders[0]?.['x-claude-code-session-id'],
    result.requestHeaders[1]?.['x-claude-code-session-id'],
  )
  assert.equal(
    result.requestBodies[0]?.metadata?.session_id,
    result.requestBodies[1]?.metadata?.session_id,
  )
  assert.equal(result.requestBodies[0]?.metadata?.originator, 'claude-code')
  assert.equal(
    result.requestBodies[0]?.metadata?.workspace,
    projectRoot,
  )
  assert.match(
    result.requestBodies[0]?.metadata?.user_agent ?? '',
    /^claude-code\//,
  )
  assert.match(
    result.requestHeaders[0]?.['user-agent'] ?? '',
    /^claude-code\//,
  )
}

async function main() {
  await runStreamingAssertions()
  await runSameResponseIncrementalAssertions()
  await runPermissionAssertions('deny')
  await runPermissionAssertions('allow')
  await runIdentityEnabledAssertions()
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch(error => {
    console.error(error)
    process.exit(1)
  })

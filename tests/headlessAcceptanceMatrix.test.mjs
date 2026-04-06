import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { projectRoot } from './helpers/projectRoot.mjs'

const CLI_CWD = projectRoot
const DEFAULT_CONFIG_LINES = [
  'model_provider = "test-provider"',
  'model = "gpt-5.1-codex-mini"',
  'model_reasoning_effort = "medium"',
  'response_storage = false',
]

function responseDoneItem(item) {
  return (
    'event: response.output_item.done\n' +
    `data: ${JSON.stringify({ type: 'response.output_item.done', item })}\n\n`
  )
}

function responseCompleted(id) {
  return (
    'event: response.completed\n' +
    `data: ${JSON.stringify({ type: 'response.completed', response: { id } })}\n\n`
  )
}

function responseDone() {
  return 'data: [DONE]\n\n'
}

async function withResponsesServer(responseBatches, fn) {
  const seenRequestBodies = []
  const seenRequestHeaders = []
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
    req.on('end', async () => {
      seenRequestHeaders.push(req.headers)
      seenRequestBodies.push(JSON.parse(body))
      const steps =
        responseBatches[seenRequestBodies.length - 1] ??
        responseBatches.at(-1) ??
        []
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        connection: 'keep-alive',
        'cache-control': 'no-cache',
      })
      for (const step of steps) {
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
    throw new Error('failed to bind test provider server')
  }

  try {
    return await fn({
      port: address.port,
      seenRequestBodies,
      seenRequestHeaders,
    })
  } finally {
    for (const socket of sockets) {
      socket.destroy()
    }
    await new Promise(resolve => server.close(resolve))
  }
}

async function writeCodexConfig(homeDir, port, configLines = DEFAULT_CONFIG_LINES) {
  const codexDir = join(homeDir, '.codex')
  await mkdir(codexDir, { recursive: true })
  await writeFile(
    join(codexDir, 'config.toml'),
    [
      ...configLines,
      '',
      '[model_providers.test-provider]',
      `base_url = "http://127.0.0.1:${port}"`,
      'env_key = "ANTHROPIC_API_KEY"',
      '',
    ].join('\n'),
  )
}

async function runStructuredHeadlessSession({
  responseBatches,
  configLines = DEFAULT_CONFIG_LINES,
  currentCwd = CLI_CWD,
  extraArgs = [],
  extraEnv = {},
  permissionDecision,
  afterInitialize,
  initialMessages = [],
}) {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-headless-matrix-'))
  return withResponsesServer(responseBatches, async serverState => {
    await writeCodexConfig(tempHome, serverState.port, configLines)

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
        '--verbose',
        '--debug-to-stderr',
        ...(permissionDecision ? ['--permission-prompt-tool', 'stdio'] : []),
        ...extraArgs,
      ],
      {
        cwd: currentCwd,
        env: {
          ...process.env,
          HOME: tempHome,
          ANTHROPIC_API_KEY: 'test-key',
          CODEX_CODE_USE_CODEX_PROVIDER: '1',
          ...extraEnv,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )

    const stdoutMessages = []
    const stderrChunks = []
    const waiters = []
    let stdoutBuffer = ''

    function flushWaiters() {
      for (let index = waiters.length - 1; index >= 0; index -= 1) {
        const waiter = waiters[index]
        if (stdoutMessages.some(waiter.predicate)) {
          waiters.splice(index, 1)
          waiter.resolve()
        }
      }
    }

    function waitForMessage(predicate) {
      if (stdoutMessages.some(predicate)) {
        return Promise.resolve()
      }
      return new Promise(resolve => waiters.push({ predicate, resolve }))
    }

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
                    behavior: permissionDecision ?? 'allow',
                    updatedInput: parsed.request.input,
                    message:
                      permissionDecision === 'deny'
                        ? 'denied by matrix test'
                        : undefined,
                  },
                },
              }) + '\n',
            )
          }
          if (parsed.type === 'result' && !child.stdin.destroyed) {
            child.stdin.end()
          }
          flushWaiters()
        }
        newlineIndex = stdoutBuffer.indexOf('\n')
      }
    })

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

    await Promise.race([
      waitForMessage(
        message =>
          message.type === 'control_response' &&
          message.response?.subtype === 'success' &&
          message.response?.request_id === 'init-1',
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('initialize timed out')), 45000),
      ),
    ])

    if (afterInitialize) {
      await afterInitialize({ child, waitForMessage, stdoutMessages })
    }

    for (const message of initialMessages) {
      child.stdin.write(JSON.stringify(message) + '\n')
    }

    let code
    try {
      const [exitCode] = await Promise.race([
        once(child, 'close'),
        new Promise((_, reject) =>
          setTimeout(() => {
            child.kill('SIGKILL')
            reject(
              new Error(
                `structured headless session timed out\nstdout=${stdoutMessages.map(message => JSON.stringify(message)).join('\n')}\nstderr=${stderrChunks.join('')}`,
              ),
            )
          }, 45000),
        ),
      ])
      code = exitCode
    } finally {
      child.stdin.destroy()
      await rm(tempHome, { recursive: true, force: true })
    }

    return {
      code,
      messages: stdoutMessages,
      stderr: stderrChunks.join(''),
      requestBodies: serverState.seenRequestBodies,
      requestHeaders: serverState.seenRequestHeaders,
    }
  })
}

async function runPrintOutputSession({
  prompt,
  outputFormat,
  responseBatches,
  configLines = DEFAULT_CONFIG_LINES,
}) {
  const tempHome = await mkdtemp(join(tmpdir(), `codex-headless-${outputFormat}-`))
  return withResponsesServer(responseBatches, async serverState => {
    await writeCodexConfig(tempHome, serverState.port, configLines)

    const child = spawn(
      'node',
      [
        'dist/cli.js',
        '-p',
        '--bare',
        '--output-format',
        outputFormat,
        '--debug-to-stderr',
      ],
      {
        cwd: CLI_CWD,
        env: {
          ...process.env,
          HOME: tempHome,
          ANTHROPIC_API_KEY: 'test-key',
          CODEX_CODE_USE_CODEX_PROVIDER: '1',
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
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.stdin.end(prompt)

    try {
      const [code] = await Promise.race([
        once(child, 'close'),
        new Promise((_, reject) =>
          setTimeout(() => {
            child.kill('SIGKILL')
            reject(new Error(`print ${outputFormat} timed out\nstderr=${stderr}`))
          }, 45000),
        ),
      ])
      return {
        code,
        stdout,
        stderr,
        requestBodies: serverState.seenRequestBodies,
      }
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })
}

async function seedCrossProjectResumeFixture(tempHome) {
  const currentCwd = CLI_CWD
  const resumedCwd = join(tempHome, 'resumed-worktree-project')
  const currentProjectDir = join(
    tempHome,
    '.claude',
    'projects',
    sanitizePath(currentCwd),
  )
  const resumedProjectDir = join(
    tempHome,
    '.claude',
    'projects',
    sanitizePath(resumedCwd),
  )
  await mkdir(currentProjectDir, { recursive: true })
  await mkdir(resumedProjectDir, { recursive: true })
  await mkdir(resumedCwd, { recursive: true })

  const resumedSessionId = randomUUID()
  const transcriptPath = join(resumedProjectDir, `${resumedSessionId}.jsonl`)
  const promptId = randomUUID()
  await writeFile(
    transcriptPath,
    [
      JSON.stringify({
        parentUuid: null,
        isSidechain: false,
        promptId,
        type: 'user',
        message: { role: 'user', content: '先回一句 done。' },
        uuid: 'user-1',
        timestamp: new Date().toISOString(),
        permissionMode: 'default',
        userType: 'external',
        entrypoint: 'sdk-cli',
        cwd: resumedCwd,
        sessionId: resumedSessionId,
        version: '0.0.0-dev',
        gitBranch: 'main',
      }),
      JSON.stringify({
        parentUuid: 'user-1',
        isSidechain: false,
        type: 'assistant',
        uuid: 'assistant-1',
        timestamp: new Date().toISOString(),
        message: {
          id: 'assistant-1',
          container: null,
          model: 'codex-synthetic',
          role: 'assistant',
          stop_reason: 'stop_sequence',
          stop_sequence: '',
          type: 'message',
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
            service_tier: null,
            cache_creation: {
              ephemeral_1h_input_tokens: 0,
              ephemeral_5m_input_tokens: 0,
            },
            inference_geo: null,
            iterations: null,
            speed: null,
          },
          content: [{ type: 'text', text: 'done' }],
          context_management: null,
        },
        modelTurnItems: [
          {
            kind: 'final_answer',
            provider: 'custom',
            text: 'done',
            source: 'message_output_filtered',
          },
        ],
        userType: 'external',
        entrypoint: 'sdk-cli',
        cwd: resumedCwd,
        sessionId: resumedSessionId,
        version: '0.0.0-dev',
        gitBranch: 'main',
      }),
    ].join('\n') + '\n',
    'utf8',
  )

  const resumedSummaryPath = join(
    resumedProjectDir,
    resumedSessionId,
    'session-memory',
    'summary.md',
  )
  await mkdir(join(resumedSummaryPath, '..'), { recursive: true })
  await writeFile(
    resumedSummaryPath,
    '# Current State\nPrefer the resumed worktree summary\n',
    'utf8',
  )

  const wrongSummaryPath = join(
    currentProjectDir,
    randomUUID(),
    'session-memory',
    'summary.md',
  )
  await mkdir(join(wrongSummaryPath, '..'), { recursive: true })
  await writeFile(
    wrongSummaryPath,
    '# Current State\nWrong current cwd project summary\n',
    'utf8',
  )

  return {
    currentCwd,
    resumedCwd,
    transcriptPath,
  }
}

async function runResumeCompactMatrixCase() {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-resume-matrix-'))
  const {
    currentCwd,
    transcriptPath,
  } = await seedCrossProjectResumeFixture(tempHome)

  try {
    const result = await runStructuredHeadlessSession({
      responseBatches: [],
      currentCwd,
      extraArgs: ['--resume', transcriptPath],
      afterInitialize: async ({ child }) => {
        child.stdin.write(
          JSON.stringify({
            type: 'user',
            session_id: randomUUID(),
            parent_tool_use_id: null,
            message: { role: 'user', content: '/compact' },
            uuid: 'user-compact',
          }) + '\n',
        )
      },
    })

    assert.equal(result.code, 0, result.stderr)
    const transcriptOutput = result.messages
      .map(message => JSON.stringify(message))
      .join('\n')
    assert.match(transcriptOutput, /Prefer the resumed worktree summary/)
    assert.doesNotMatch(transcriptOutput, /Wrong current cwd project summary/)
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
}

function sanitizePath(value) {
  return value.replace(/[^a-zA-Z0-9]/g, '-')
}

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('matrix: basic question answer works in stream-json headless mode', async () => {
  const result = await runStructuredHeadlessSession({
    responseBatches: [[
      {
        block: responseDoneItem({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'matrix hello' }],
        }),
      },
      { block: responseCompleted('resp-basic-1') },
      { block: responseDone() },
    ]],
    initialMessages: [
      {
        type: 'user',
        session_id: '',
        parent_tool_use_id: null,
        message: { role: 'user', content: '你好' },
        uuid: 'user-1',
      },
    ],
  })

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.requestBodies[0]?.model, 'gpt-5.1-codex-mini')
  assert.equal(result.requestBodies[0]?.reasoning?.effort, 'medium')
  assert.equal(
    result.messages.some(
      message =>
        message.type === 'assistant' &&
        message.message?.content?.some?.(
          part => part.type === 'text' && part.text === 'matrix hello',
        ),
    ),
    true,
  )
})

test('matrix: structured tool call with allow and deny permission branches stays closed-loop', async () => {
  for (const permissionDecision of ['allow', 'deny']) {
    const finalText = permissionDecision === 'allow' ? 'allowed' : 'denied'
    const result = await runStructuredHeadlessSession({
      permissionDecision,
      responseBatches: [
        [
          {
            block: responseDoneItem({
              type: 'function_call',
              call_id: `tool-${permissionDecision}`,
              name: 'Bash',
              arguments: JSON.stringify({
                command: `echo ${permissionDecision} > /tmp/codex-matrix-${permissionDecision}.txt`,
              }),
            }),
          },
          { block: responseCompleted(`resp-tool-${permissionDecision}-1`) },
          { block: responseDone() },
        ],
        [
          {
            block: responseDoneItem({
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: finalText }],
            }),
          },
          { block: responseCompleted(`resp-tool-${permissionDecision}-2`) },
          { block: responseDone() },
        ],
      ],
      initialMessages: [
        {
          type: 'user',
          session_id: '',
          parent_tool_use_id: null,
          message: { role: 'user', content: `请处理权限测试 ${permissionDecision}` },
          uuid: `user-${permissionDecision}`,
        },
      ],
    })

    assert.equal(result.code, 0, result.stderr)
    const modelTurnItems = result.messages.filter(
      message => message.type === 'system' && message.subtype === 'model_turn_item',
    )
    assert.deepEqual(
      modelTurnItems.map(message => message.item_kind),
      [
        'local_shell_call',
        'permission_request',
        'permission_decision',
        'tool_output',
        'local_shell_call',
        'execution_result',
      ],
    )
    const permissionDecisionItem = modelTurnItems.find(
      message => message.item_kind === 'permission_decision',
    )
    assert.equal(permissionDecisionItem?.item?.decision, permissionDecision)
    assert.equal(
      permissionDecisionItem?.item?.details?.decision_source,
      'permission_prompt_tool',
    )
    assert.equal(
      result.messages.some(
        message =>
          message.type === 'control_request' &&
          message.request?.subtype === 'can_use_tool',
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
})

test('matrix: prompt cache key and request shape stay stable through a multi-step tool loop', async () => {
  const result = await runStructuredHeadlessSession({
    responseBatches: [
      [
        {
          block: responseDoneItem({
            type: 'function_call',
            call_id: 'tool-step-1',
            name: 'Bash',
            arguments: JSON.stringify({
              command: 'pwd',
            }),
          }),
        },
        { block: responseCompleted('resp-stability-1') },
        { block: responseDone() },
      ],
      [
        {
          block: responseDoneItem({
            type: 'function_call',
            call_id: 'tool-step-2',
            name: 'Bash',
            arguments: JSON.stringify({
              command: 'printf second',
            }),
          }),
        },
        { block: responseCompleted('resp-stability-2') },
        { block: responseDone() },
      ],
      [
        {
          block: responseDoneItem({
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'stable done' }],
          }),
        },
        { block: responseCompleted('resp-stability-3') },
        { block: responseDone() },
      ],
    ],
    initialMessages: [
      {
        type: 'user',
        session_id: '',
        parent_tool_use_id: null,
        message: { role: 'user', content: 'run two bash steps and then finish' },
        uuid: 'user-stability',
      },
    ],
  })

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.requestBodies.length, 3)

  const [firstRequest, secondRequest, thirdRequest] = result.requestBodies
  assert.equal(firstRequest?.prompt_cache_key, secondRequest?.prompt_cache_key)
  assert.equal(secondRequest?.prompt_cache_key, thirdRequest?.prompt_cache_key)
  assert.equal(firstRequest?.model, secondRequest?.model)
  assert.equal(secondRequest?.model, thirdRequest?.model)
  assert.deepEqual(firstRequest?.reasoning, secondRequest?.reasoning)
  assert.deepEqual(secondRequest?.reasoning, thirdRequest?.reasoning)
  assert.equal(firstRequest?.tool_choice, secondRequest?.tool_choice)
  assert.equal(secondRequest?.tool_choice, thirdRequest?.tool_choice)
  assert.deepEqual(firstRequest?.tools, secondRequest?.tools)
  assert.deepEqual(secondRequest?.tools, thirdRequest?.tools)
  assert.deepEqual(firstRequest?.instructions, secondRequest?.instructions)
  assert.deepEqual(secondRequest?.instructions, thirdRequest?.instructions)
  assert.deepEqual(
    result.requestBodies.map(request => request.input.length),
    [1, 3, 5],
  )

  const requestCallIds = result.requestBodies.map(request =>
    request.input
      .filter(item => item.type === 'function_call')
      .map(item => item.call_id),
  )
  assert.deepEqual(requestCallIds, [
    [],
    ['tool-step-1'],
    ['tool-step-1', 'tool-step-2'],
  ])
})

test('matrix: cross-project resume then compact keeps the resumed transcript summary', async () => {
  await runResumeCompactMatrixCase()
})

test('matrix: cross-project resume restores request workspace and prompt cwd before the first turn', async () => {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-resume-cwd-'))
  const {
    currentCwd,
    resumedCwd,
    transcriptPath,
  } = await seedCrossProjectResumeFixture(tempHome)

  try {
    const result = await runStructuredHeadlessSession({
      responseBatches: [[
        {
          block: responseDoneItem({
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'cwd restored' }],
          }),
        },
        { block: responseCompleted('resp-resume-cwd-1') },
        { block: responseDone() },
      ]],
      currentCwd,
      extraArgs: ['--resume', transcriptPath],
      extraEnv: {
        CODEX_CODE_SEND_REQUEST_IDENTITY: '1',
      },
      initialMessages: [
        {
          type: 'user',
          session_id: '',
          parent_tool_use_id: null,
          message: { role: 'user', content: '请只回复 cwd restored' },
          uuid: 'user-resume-cwd',
        },
      ],
    })

    assert.equal(result.code, 0, result.stderr)
    assert.equal(result.requestBodies.length, 1)
    assert.equal(result.requestBodies[0]?.metadata?.workspace, resumedCwd)

    const promptDump = String(result.requestBodies[0]?.instructions ?? '')
    assert.match(
      promptDump,
      new RegExp(`CWD: ${escapeForRegExp(resumedCwd)}`),
    )
    assert.doesNotMatch(
      promptDump,
      new RegExp(`CWD: ${escapeForRegExp(currentCwd)}`),
    )
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
})

test('matrix: initialize model list and runtime model switch stay on Codex-only capability surface', async () => {
  const result = await runStructuredHeadlessSession({
    responseBatches: [[
      {
        block: responseDoneItem({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'model switched' }],
        }),
      },
      { block: responseCompleted('resp-model-switch') },
      { block: responseDone() },
    ]],
    afterInitialize: async ({ child, waitForMessage }) => {
      child.stdin.write(
        JSON.stringify({
          type: 'control_request',
          request_id: 'set-model-1',
          request: {
            subtype: 'set_model',
            model: 'gpt-5.1-codex-max',
          },
        }) + '\n',
      )
      await waitForMessage(
        message =>
          message.type === 'control_response' &&
          message.response?.request_id === 'set-model-1',
      )
      child.stdin.write(
        JSON.stringify({
          type: 'user',
          session_id: '',
          parent_tool_use_id: null,
          message: { role: 'user', content: '切模型后继续回答' },
          uuid: 'user-model-switch',
        }) + '\n',
      )
    },
  })

  assert.equal(result.code, 0, result.stderr)
  const initResponse = result.messages.find(
    message =>
      message.type === 'control_response' &&
      message.response?.request_id === 'init-1',
  )
  const models = initResponse?.response?.response?.models ?? []
  assert.deepEqual(
    models.map(model => model.value),
    [
      'default',
      'gpt-5.4-mini',
      'gpt-5.4',
      'gpt-5.3-codex',
      'gpt-5.2-codex',
      'gpt-5.1-codex-mini',
      'gpt-5.1-codex',
      'gpt-5.1-codex-max',
    ],
  )
  assert.equal(result.requestBodies[0]?.model, 'gpt-5.1-codex-max')
  assert.equal(result.requestBodies[0]?.reasoning?.effort, 'medium')
})

test('matrix: configured xhigh reasoning effort reaches the provider request body', async () => {
  const result = await runStructuredHeadlessSession({
    configLines: [
      'model_provider = "test-provider"',
      'model = "gpt-5.1-codex-max"',
      'model_reasoning_effort = "xhigh"',
      'response_storage = false',
    ],
    responseBatches: [[
      {
        block: responseDoneItem({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'xhigh effort' }],
        }),
      },
      { block: responseCompleted('resp-effort-xhigh') },
      { block: responseDone() },
    ]],
    initialMessages: [
      {
        type: 'user',
        session_id: '',
        parent_tool_use_id: null,
        message: { role: 'user', content: '用 xhigh effort 回答' },
        uuid: 'user-effort',
      },
    ],
  })

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.requestBodies[0]?.model, 'gpt-5.1-codex-max')
  assert.equal(result.requestBodies[0]?.reasoning?.effort, 'xhigh')
})

test('matrix: output format text returns plain final text', async () => {
  const result = await runPrintOutputSession({
    prompt: '输出 text',
    outputFormat: 'text',
    responseBatches: [[
      {
        block: responseDoneItem({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'text output ok' }],
        }),
      },
      { block: responseCompleted('resp-text-output') },
      { block: responseDone() },
    ]],
  })

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'text output ok')
})

test('matrix: output format json returns a result object', async () => {
  const result = await runPrintOutputSession({
    prompt: '输出 json',
    outputFormat: 'json',
    responseBatches: [[
      {
        block: responseDoneItem({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'json output ok' }],
        }),
      },
      { block: responseCompleted('resp-json-output') },
      { block: responseDone() },
    ]],
  })

  assert.equal(result.code, 0, result.stderr)
  const parsed = JSON.parse(result.stdout)
  assert.equal(parsed.type, 'result')
  assert.equal(parsed.subtype, 'success')
  assert.equal(parsed.result, 'json output ok')
})

test('matrix: output format stream-json emits assistant then result', async () => {
  const result = await runStructuredHeadlessSession({
    responseBatches: [[
      {
        block: responseDoneItem({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'stream output ok' }],
        }),
      },
      { block: responseCompleted('resp-stream-output') },
      { block: responseDone() },
    ]],
    initialMessages: [
      {
        type: 'user',
        session_id: '',
        parent_tool_use_id: null,
        message: { role: 'user', content: '输出 stream-json' },
        uuid: 'user-stream-output',
      },
    ],
  })

  assert.equal(result.code, 0, result.stderr)
  const assistantIndex = result.messages.findIndex(
    message =>
      message.type === 'assistant' &&
      message.message?.content?.some?.(
        part => part.type === 'text' && part.text === 'stream output ok',
      ),
  )
  const resultIndex = result.messages.findIndex(message => message.type === 'result')
  assert.notEqual(assistantIndex, -1)
  assert.notEqual(resultIndex, -1)
  assert.ok(assistantIndex < resultIndex)
})

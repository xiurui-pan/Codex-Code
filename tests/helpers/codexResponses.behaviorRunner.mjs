import http from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mode = process.argv[2]
process.env.NODE_ENV ??= 'test'

globalThis.MACRO ??= {
  VERSION: '0.0.0-test',
}

function withEnv(overrides, fn) {
  const previous = new Map()
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of previous.entries()) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    })
}

async function runMerge() {
  const { mergeStreamedAssistantMessages } = await import(
    '../../src/services/api/assistantEnvelope.ts'
  )

  const merged = mergeStreamedAssistantMessages([
    {
      type: 'assistant',
      uuid: 'assistant-1',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'first' }],
      },
      modelTurnItems: [
        {
          kind: 'final_answer',
          provider: 'custom',
          text: 'first',
          source: 'message_output',
        },
      ],
    },
    {
      type: 'assistant',
      uuid: 'assistant-2',
      message: {
        role: 'assistant',
        content: [],
      },
      modelTurnItems: [
        {
          kind: 'local_shell_call',
          provider: 'custom',
          toolUseId: 'tool-1',
          toolName: 'Bash',
          command: 'pwd',
          phase: 'requested',
          source: 'provider',
        },
        {
          kind: 'tool_call',
          provider: 'custom',
          toolUseId: 'tool-1',
          toolName: 'Bash',
          input: { command: 'pwd' },
          source: 'structured',
        },
        {
          kind: 'final_answer',
          provider: 'custom',
          text: 'second',
          source: 'message_output',
        },
      ],
    },
  ])

  return {
    turnItemKinds: merged?.modelTurnItems?.map(item => item.kind) ?? [],
    content:
      merged?.message.content.map(part =>
        part.type === 'text' ? part.text : part.type,
      ) ?? [],
  }
}

async function runQuery() {
  const { queryCodexResponses } = await import(
    '../../src/services/api/codexResponses.ts'
  )

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/responses') {
      res.writeHead(404).end('not found')
      return
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      connection: 'keep-alive',
      'cache-control': 'no-cache',
    })
    res.write(
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"tool-agg","name":"Bash","arguments":"{\\"command\\":\\"pwd\\"}"}}\n\n',
    )
    res.write(
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"done"}]}}\n\n',
    )
    res.write(
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-agg"}}\n\n',
    )
    res.end('data: [DONE]\n\n')
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('failed to bind test server')
  }

  try {
    return await withEnv(
      {
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}`,
        ANTHROPIC_API_KEY: 'test-key',
        ANTHROPIC_MODEL: 'gpt-5.1-codex-mini',
      },
      async () => {
        const assistantMessage = await queryCodexResponses({
          messages: [
            {
              type: 'user',
              uuid: 'user-1',
              message: { content: 'test' },
            },
          ],
          systemPrompt: [],
          options: {},
          signal: new AbortController().signal,
        })

        return {
          turnItemKinds: assistantMessage.turnItems.map(item => item.kind),
          errorMessage: assistantMessage.errorMessage ?? null,
        }
      },
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

async function runMultilineDataFallback() {
  const { queryCodexResponses } = await import(
    '../../src/services/api/codexResponses.ts'
  )

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/responses') {
      res.writeHead(404).end('not found')
      return
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      connection: 'keep-alive',
      'cache-control': 'no-cache',
    })
    res.write('event: response.output_item.done\n')
    res.write(
      'data: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"clau\n',
    )
    res.write('data: de"}]}}\n\n')
    res.write(
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-multiline"}}\n\n',
    )
    res.end('data: [DONE]\n\n')
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('failed to bind test server')
  }

  try {
    return await withEnv(
      {
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}`,
        ANTHROPIC_API_KEY: 'test-key',
        ANTHROPIC_MODEL: 'gpt-5.1-codex-mini',
      },
      async () => {
        const result = await queryCodexResponses({
          messages: [
            {
              type: 'user',
              uuid: 'user-1',
              message: { content: 'test multiline fallback' },
            },
          ],
          systemPrompt: [],
          options: {},
          signal: new AbortController().signal,
        })

        return {
          turnItemKinds: result.turnItems.map(item => item.kind),
          finalText:
            result.turnItems.find(item => item.kind === 'final_answer')?.text ??
            null,
          errorMessage: result.errorMessage ?? null,
        }
      },
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

async function runDeltaWithoutIndexes() {
  const { queryCodexResponsesStream } = await import(
    '../../src/services/api/codexResponses.ts'
  )

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/responses') {
      res.writeHead(404).end('not found')
      return
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      connection: 'keep-alive',
      'cache-control': 'no-cache',
    })
    res.write(
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"FIRST_STREAM_OK"}\n\n',
    )
    res.write(
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":" SECOND_DONE"}\n\n',
    )
    res.write(
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-delta-no-index"}}\n\n',
    )
    res.end('data: [DONE]\n\n')
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('failed to bind test server')
  }

  try {
    return await withEnv(
      {
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}`,
        ANTHROPIC_API_KEY: 'test-key',
        ANTHROPIC_MODEL: 'gpt-5.1-codex-mini',
      },
      async () => {
        const events = []
        for await (const chunk of queryCodexResponsesStream({
          messages: [
            {
              type: 'user',
              uuid: 'user-1',
              message: { content: 'stream without indexes' },
            },
          ],
          systemPrompt: [],
          options: {},
          signal: new AbortController().signal,
        })) {
          if (chunk.kind === 'stream_event') {
            events.push(chunk.event)
          }
        }

        return {
          eventTypes: events.map(event => event.type),
          eventIndexes: events.map(event => event.index ?? null),
          deltaTexts: events
            .map(event => event.delta?.text ?? null)
            .filter(text => typeof text === 'string'),
        }
      },
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

async function runIdentity(sendIdentity) {
  const { buildCodexRequestIdentity } = await import(
    '../../src/services/api/codexRequestIdentity.ts'
  )
  const { buildResponsesBody } = await import(
    '../../src/services/api/codexResponses.ts'
  )

  return withEnv(
    {
      ANTHROPIC_MODEL: 'gpt-5.1-codex-mini',
      CODEX_CODE_CODEX_SEND_REQUEST_IDENTITY: sendIdentity ? '1' : undefined,
    },
    async () => {
      const identity = buildCodexRequestIdentity()
      const body = await buildResponsesBody({
        messages: [
          {
            type: 'user',
            uuid: 'user-1',
            message: { content: 'test' },
          },
        ],
        systemPrompt: [],
        options: {},
      })

      return {
        headers: identity.headers,
        metadata: identity.metadata ?? null,
        bodyMetadata: body.metadata ?? null,
      }
    },
  )
}

async function runMissingBaseUrl() {
  const { queryCodexResponses } = await import(
    '../../src/services/api/codexResponses.ts'
  )

  const tempHome = await mkdtemp(join(tmpdir(), 'codex-responses-missing-base-'))

  try {
    return await withEnv(
      {
        HOME: tempHome,
        CODEX_HOME: tempHome,
        XDG_CONFIG_HOME: tempHome,
        ANTHROPIC_BASE_URL: undefined,
        ANTHROPIC_MODEL: 'gpt-5.1-codex-mini',
      },
      async () => {
        const result = await queryCodexResponses({
          messages: [
            {
              type: 'user',
              uuid: 'user-1',
              message: { content: 'test' },
            },
          ],
          systemPrompt: [],
          options: {},
          signal: new AbortController().signal,
        })

        return {
          errorMessage: result.errorMessage ?? null,
        }
      },
    )
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
}

async function runToolBody() {
  const { buildResponsesBody } = await import(
    '../../src/services/api/codexResponses.ts'
  )

  return withEnv(
    {
      ANTHROPIC_MODEL: 'gpt-5.1-codex-mini',
    },
    async () => {
      const body = await buildResponsesBody({
        messages: [
          {
            type: 'user',
            uuid: 'user-1',
            message: { content: 'read the repo and search the web' },
          },
        ],
        systemPrompt: [],
        options: {
          tools: [
            {
              name: 'ReadAllFiles',
              prompt: async () => 'Read files from the working directory',
              inputJSONSchema: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                },
                required: ['path'],
              },
            },
          ],
          extraToolSchemas: [
            {
              type: 'web_search_20250305',
              name: 'web_search',
              allowed_domains: ['example.com'],
            },
          ],
        },
      })

      const xhighBody = await buildResponsesBody({
        messages: [
          {
            type: 'user',
            uuid: 'user-2',
            message: { content: 'reason harder' },
          },
        ],
        systemPrompt: [],
        options: {
          model: 'gpt-5.4',
          effortValue: 'xhigh',
        },
      })

      const unsupportedBody = await buildResponsesBody({
        messages: [
          {
            type: 'user',
            uuid: 'user-3',
            message: { content: 'legacy reasoning' },
          },
        ],
        systemPrompt: [],
        options: {
          model: 'gpt-5.1-codex-mini',
          effortValue: 'xhigh',
        },
      })

      const configDefaultBody = await withEnv(
        {
          CODEX_CODE_DEFAULT_REASONING_EFFORT: 'medium',
          CODEX_CODE_EFFORT_LEVEL: undefined,
        },
        async () => buildResponsesBody({
          messages: [
            {
              type: 'user',
              uuid: 'user-4',
              message: { content: 'config default reasoning' },
            },
          ],
          systemPrompt: [],
          options: {
            model: 'gpt-5.4',
          },
        }),
      )

      const sessionOverrideBody = await withEnv(
        {
          CODEX_CODE_DEFAULT_REASONING_EFFORT: 'medium',
          CODEX_CODE_EFFORT_LEVEL: undefined,
        },
        async () => buildResponsesBody({
          messages: [
            {
              type: 'user',
              uuid: 'user-5',
              message: { content: 'session override wins' },
            },
          ],
          systemPrompt: [],
          options: {
            model: 'gpt-5.4',
            effortValue: 'high',
          },
        }),
      )

      return {
        toolNames: (body.tools ?? []).map(tool => tool.name ?? tool.type),
        webSearchTool: (body.tools ?? []).find(tool => tool.type === 'web_search') ?? null,
        xhighReasoning: xhighBody.reasoning ?? null,
        unsupportedReasoning: unsupportedBody.reasoning ?? null,
        configDefaultReasoning: configDefaultBody.reasoning ?? null,
        sessionOverrideReasoning: sessionOverrideBody.reasoning ?? null,
      }
    },
  )
}

async function runQueryToolForwarding() {
  const { queryCodexResponses } = await import(
    '../../src/services/api/codexResponses.ts'
  )

  let capturedBody = null
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/responses') {
      res.writeHead(404).end('not found')
      return
    }

    let requestText = ''
    req.setEncoding('utf8')
    req.on('data', chunk => {
      requestText += chunk
    })
    req.on('end', () => {
      capturedBody = JSON.parse(requestText)
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        connection: 'keep-alive',
        'cache-control': 'no-cache',
      })
      res.write(
        'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"done"}]}}\n\n',
      )
      res.write(
        'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-tool-forward"}}\n\n',
      )
      res.end('data: [DONE]\n\n')
    })
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('failed to bind test server')
  }

  try {
    return await withEnv(
      {
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}`,
        ANTHROPIC_API_KEY: 'test-key',
        ANTHROPIC_MODEL: 'gpt-5.1-codex-mini',
      },
      async () => {
        await queryCodexResponses({
          messages: [
            {
              type: 'user',
              uuid: 'user-1',
              message: { content: 'inspect the repo' },
            },
          ],
          systemPrompt: [],
          tools: [
            {
              name: 'ReadAllFiles',
              prompt: async () => 'Read files from the working directory',
              inputJSONSchema: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                },
                required: ['path'],
              },
            },
          ],
          options: {},
          signal: new AbortController().signal,
        })

        return {
          toolNames: (capturedBody?.tools ?? []).map(
            tool => tool.name ?? tool.type,
          ),
          toolChoice: capturedBody?.tool_choice ?? null,
        }
      },
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

const result =
  mode === 'merge'
    ? await runMerge()
    : mode === 'query'
      ? await runQuery()
      : mode === 'multiline-data-fallback'
        ? await runMultilineDataFallback()
        : mode === 'delta-without-indexes'
          ? await runDeltaWithoutIndexes()
      : mode === 'identity-default'
        ? await runIdentity(false)
        : mode === 'identity-enabled'
          ? await runIdentity(true)
          : mode === 'tool-body'
            ? await runToolBody()
            : mode === 'query-tool-forwarding'
              ? await runQueryToolForwarding()
              : await runMissingBaseUrl()
process.stdout.write(JSON.stringify(result))

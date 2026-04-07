import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import { afterEach, test } from 'node:test'
import {
  buildResponsesBody,
  buildResponsesCompactBody,
  queryCodexResponsesCompact,
} from '../src/services/api/codexResponses.js'
import { summarizeResponsesCompactionOutput } from '../src/services/compact/compact.js'
import { createUserMessage } from '../src/utils/messages.js'
import { cleanMessagesForLogging } from '../src/utils/sessionStorage.js'

(globalThis as typeof globalThis & { MACRO?: { VERSION: string } }).MACRO ??= {
  VERSION: '0.0.0-test',
}

const envKeys = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
]

const originalEnv = new Map(
  envKeys.map(key => [key, process.env[key]]),
)

afterEach(() => {
  for (const [key, value] of originalEnv.entries()) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
})

test('responses request builder keeps replay-only compact history separate from the next user turn', async () => {
  const replayHistoryMessage = createUserMessage({
    content: [],
    isMeta: true,
    modelTurnItems: [
      {
        kind: 'raw_model_output',
        provider: 'custom',
        itemType: 'message',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'kept compacted user turn' }],
        },
      },
      {
        kind: 'raw_model_output',
        provider: 'custom',
        itemType: 'compaction',
        payload: {
          type: 'compaction',
          encrypted_content: 'enc-1',
        },
      },
      {
        kind: 'opaque_compaction',
        provider: 'custom',
        itemType: 'compaction',
        payload: {
          type: 'compaction',
          encrypted_content: 'enc-1',
        },
      },
    ],
  })

  const body = await buildResponsesBody({
    messages: [
      replayHistoryMessage,
      createUserMessage({
        content: 'What should I do next?',
      }),
    ],
    systemPrompt: [],
    options: {
      model: 'gpt-5.4',
    },
  })

  assert.deepEqual(
    body.input.map(item => item.type),
    ['message', 'compaction', 'message'],
  )
  assert.equal(body.input[0]?.type, 'message')
  assert.equal(body.input[1]?.type, 'compaction')
  assert.equal(body.input[2]?.type, 'message')
})

test('responses compact body uses the dedicated compact request shape', async () => {
  const body = await buildResponsesCompactBody({
    messages: [
      createUserMessage({
        content: 'Compact this conversation.',
      }),
    ],
    systemPrompt: ['You are the developer instruction.'],
    options: {
      model: 'gpt-5.4',
      effortValue: 'high',
    },
  })

  assert.equal('stream' in body, false)
  assert.equal('tool_choice' in body, false)
  assert.equal('tools' in body, false)
  assert.equal('parallel_tool_calls' in body, false)
  assert.equal(body.instructions, 'You are the developer instruction.')
  assert.deepEqual(body.reasoning, {
    effort: 'high',
    summary: 'auto',
  })
  assert.deepEqual(body.include, ['reasoning.encrypted_content'])
})

test('responses compact transport posts to /responses/compact and parses opaque output items', async () => {
  let capturedPath: string | null = null
  let capturedBody: Record<string, unknown> | null = null

  const server = http.createServer((req, res) => {
    capturedPath = req.url ?? null
    let requestText = ''
    req.setEncoding('utf8')
    req.on('data', chunk => {
      requestText += chunk
    })
    req.on('end', () => {
      capturedBody = JSON.parse(requestText) as Record<string, unknown>
      res.writeHead(200, {
        'content-type': 'application/json',
      })
      res.end(
        JSON.stringify({
          output: [
            {
              type: 'message',
              role: 'user',
              content: [
                { type: 'input_text', text: 'kept compacted user turn' },
              ],
            },
            {
              type: 'compaction',
              encrypted_content: 'ENCRYPTED_COMPACTION_SUMMARY',
            },
          ],
        }),
      )
    })
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('failed to bind compact test server')
  }

  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${address.port}`
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.ANTHROPIC_MODEL = 'gpt-5.4'

  try {
    const result = await queryCodexResponsesCompact({
      messages: [
        createUserMessage({
          content: 'Please compact this history.',
        }),
      ],
      systemPrompt: ['You are the developer instruction.'],
      options: {
        model: 'gpt-5.4',
      },
      signal: new AbortController().signal,
    })

    assert.equal(capturedPath, '/responses/compact')
    assert.equal(capturedBody?.stream, undefined)
    assert.equal(capturedBody?.tool_choice, undefined)
    assert.equal(capturedBody?.tools, undefined)
    assert.deepEqual(
      result.outputItems.map(item => item.type),
      ['message', 'compaction'],
    )
    assert.equal(
      result.turnItems.some(item => item.kind === 'opaque_compaction'),
      true,
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})

test('responses compaction summary keeps readable text but hides encrypted payloads', () => {
  const summary = summarizeResponsesCompactionOutput([
    {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'kept compacted user turn' }],
    } as never,
    {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'continue implementation' }],
    } as never,
    {
      type: 'compaction',
      encrypted_content: 'SECRET_COMPACTION_PAYLOAD',
    } as never,
    {
      type: 'reasoning',
      encrypted_content: 'SECRET_REASONING_PAYLOAD',
    } as never,
  ])

  assert.match(summary, /User: kept compacted user turn/)
  assert.match(summary, /Assistant: continue implementation/)
  assert.match(summary, /opaque compaction item/)
  assert.match(summary, /opaque reasoning item/)
  assert.doesNotMatch(summary, /SECRET_COMPACTION_PAYLOAD/)
  assert.doesNotMatch(summary, /SECRET_REASONING_PAYLOAD/)
})

test('responses compact transport rejects tool execution items', async () => {
  const server = http.createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      res.writeHead(200, {
        'content-type': 'application/json',
      })
      res.end(
        JSON.stringify({
          output: [
            {
              type: 'function_call',
              call_id: 'call-1',
              name: 'ReadAllFiles',
              arguments: '{"path":"."}',
            },
          ],
        }),
      )
    })
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('failed to bind compact test server')
  }

  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${address.port}`
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.ANTHROPIC_MODEL = 'gpt-5.4'

  try {
    await assert.rejects(
      queryCodexResponsesCompact({
        messages: [
          createUserMessage({
            content: 'Please compact this history.',
          }),
        ],
        systemPrompt: ['You are the developer instruction.'],
        options: {
          model: 'gpt-5.4',
        },
        signal: new AbortController().signal,
      }),
      /unexpectedly requested tool execution/,
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})

test('transcript logging preserves replay-only responses compaction messages', () => {
  const replayOnlyMessage = createUserMessage({
    content: [],
    isMeta: true,
    modelTurnItems: [
      {
        kind: 'raw_model_output',
        provider: 'custom',
        itemType: 'compaction',
        payload: {
          type: 'compaction',
          encrypted_content: 'ENCRYPTED_COMPACTION_SUMMARY',
        },
      },
      {
        kind: 'opaque_compaction',
        provider: 'custom',
        itemType: 'compaction',
        payload: {
          type: 'compaction',
          encrypted_content: 'ENCRYPTED_COMPACTION_SUMMARY',
        },
      },
    ],
  })

  const cleaned = cleanMessagesForLogging([replayOnlyMessage])

  assert.equal(cleaned.length, 1)
  assert.equal(cleaned[0]?.type, 'user')
  assert.deepEqual(cleaned[0]?.message.content, [])
  assert.equal(cleaned[0]?.modelTurnItems?.length, 2)
})

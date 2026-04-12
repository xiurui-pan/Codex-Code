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

async function runAssistantMessageAddedPreamble() {
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
      'event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"type":"message","id":"msg-pre","role":"assistant","phase":"commentary","content":[{"type":"output_text","text":"PREAMBLE_FROM_ADDED"}]}}\n\n',
    )
    res.write(
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"tool-1","name":"Bash","arguments":"{\\"command\\":\\"pwd\\"}"}}\n\n',
    )
    res.write(
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-added-preamble"}}\n\n',
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
        ANTHROPIC_MODEL: 'gpt-5.4',
      },
      async () => {
        const eventTypes = []
        const deltaTexts = []
        const turnItemKinds = []
        const commentaryTexts = []

        for await (const chunk of queryCodexResponsesStream({
          messages: [
            {
              type: 'user',
              uuid: 'user-1',
              message: { content: 'check preamble added' },
            },
          ],
          systemPrompt: [],
          options: {},
          signal: new AbortController().signal,
        })) {
          if (chunk.kind === 'stream_event') {
            eventTypes.push(chunk.event.type)
            if (
              chunk.event.type === 'content_block_delta' &&
              chunk.event.delta &&
              typeof chunk.event.delta === 'object' &&
              'text' in chunk.event.delta &&
              typeof chunk.event.delta.text === 'string'
            ) {
              deltaTexts.push(chunk.event.delta.text)
            }
            continue
          }

          if (chunk.kind === 'turn_items') {
            turnItemKinds.push(...chunk.turnItems.map(item => item.kind))
            commentaryTexts.push(
              ...chunk.turnItems
                .filter(
                  item =>
                    item.kind === 'ui_message' &&
                    item.source === 'commentary',
                )
                .map(item => item.text),
            )
          }
        }

        return {
          eventTypes,
          deltaTexts,
          turnItemKinds,
          commentaryTexts,
        }
      },
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

async function runAssistantMessageAddedAndDoneDedupe() {
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
      'event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"type":"message","id":"msg-dedupe","role":"assistant","phase":"commentary","content":[{"type":"output_text","text":"DEDUPE_ME"}]}}\n\n',
    )
    res.write(
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","id":"msg-dedupe","role":"assistant","phase":"commentary","content":[{"type":"output_text","text":"DEDUPE_ME"}]}}\n\n',
    )
    res.write(
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-added-done-dedupe"}}\n\n',
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
        ANTHROPIC_MODEL: 'gpt-5.4',
      },
      async () => {
        const commentaryTexts = []

        for await (const chunk of queryCodexResponsesStream({
          messages: [
            {
              type: 'user',
              uuid: 'user-1',
              message: { content: 'check added and done dedupe' },
            },
          ],
          systemPrompt: [],
          options: {},
          signal: new AbortController().signal,
        })) {
          if (chunk.kind !== 'turn_items') {
            continue
          }

          commentaryTexts.push(
            ...chunk.turnItems
              .filter(
                item =>
                  item.kind === 'ui_message' &&
                  item.source === 'commentary',
              )
              .map(item => item.text),
          )
        }

        return {
          commentaryTexts,
        }
      },
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

async function runAssistantMessageAddedDeltaThenTool() {
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
      'event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"type":"message","id":"msg-grow","role":"assistant","phase":"commentary","content":[{"type":"output_text","text":"LOOKING"}]}}\n\n',
    )
    res.write(
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","item_id":"msg-grow","delta":"LOOKING CLOSER"}\n\n',
    )
    res.write(
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"tool-grow","name":"Bash","arguments":"{\\"command\\":\\"pwd\\"}"}}\n\n',
    )
    res.write(
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-added-delta-tool"}}\n\n',
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
        ANTHROPIC_MODEL: 'gpt-5.4',
      },
      async () => {
        const commentaryTexts = []
        const turnItemKinds = []

        for await (const chunk of queryCodexResponsesStream({
          messages: [
            {
              type: 'user',
              uuid: 'user-1',
              message: { content: 'check added delta tool flush' },
            },
          ],
          systemPrompt: [],
          options: {},
          signal: new AbortController().signal,
        })) {
          if (chunk.kind !== 'turn_items') {
            continue
          }

          turnItemKinds.push(...chunk.turnItems.map(item => item.kind))
          commentaryTexts.push(
            ...chunk.turnItems
              .filter(
                item =>
                  item.kind === 'ui_message' &&
                  item.source === 'commentary',
              )
              .map(item => item.text),
          )
        }

        return {
          commentaryTexts,
          turnItemKinds,
        }
      },
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

async function runAssistantMessageEmptyAddedDeltaThenTool() {
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
      'event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"type":"message","id":"msg-empty-grow","role":"assistant","phase":"commentary","content":[]}}\n\n',
    )
    res.write(
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","item_id":"msg-empty-grow","delta":"LOOKING CLOSER"}\n\n',
    )
    res.write(
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"tool-empty-grow","name":"Bash","arguments":"{\\"command\\":\\"pwd\\"}"}}\n\n',
    )
    res.write(
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-empty-added-delta-tool"}}\n\n',
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
        ANTHROPIC_MODEL: 'gpt-5.4',
      },
      async () => {
        const commentaryTexts = []
        const turnItemKinds = []

        for await (const chunk of queryCodexResponsesStream({
          messages: [
            {
              type: 'user',
              uuid: 'user-1',
              message: { content: 'check empty added delta tool flush' },
            },
          ],
          systemPrompt: [],
          options: {},
          signal: new AbortController().signal,
        })) {
          if (chunk.kind !== 'turn_items') {
            continue
          }

          turnItemKinds.push(...chunk.turnItems.map(item => item.kind))
          commentaryTexts.push(
            ...chunk.turnItems
              .filter(
                item =>
                  item.kind === 'ui_message' &&
                  item.source === 'commentary',
              )
              .map(item => item.text),
          )
        }

        return {
          commentaryTexts,
          turnItemKinds,
        }
      },
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

async function runAssistantMessageEmptyAddedDeltaToolDoneDedupe() {
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
      'event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"type":"message","id":"msg-empty-dedupe","role":"assistant","phase":"commentary","content":[]}}\n\n',
    )
    res.write(
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","item_id":"msg-empty-dedupe","delta":"LOOKING CLOSER"}\n\n',
    )
    res.write(
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"tool-empty-dedupe","name":"Bash","arguments":"{\\"command\\":\\"pwd\\"}"}}\n\n',
    )
    res.write(
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","id":"msg-empty-dedupe","role":"assistant","phase":"commentary","content":[{"type":"output_text","text":"LOOKING CLOSER"}]}}\n\n',
    )
    res.write(
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-empty-added-delta-dedupe"}}\n\n',
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
        ANTHROPIC_MODEL: 'gpt-5.4',
      },
      async () => {
        const commentaryTexts = []

        for await (const chunk of queryCodexResponsesStream({
          messages: [
            {
              type: 'user',
              uuid: 'user-1',
              message: { content: 'check empty added dedupe after tool' },
            },
          ],
          systemPrompt: [],
          options: {},
          signal: new AbortController().signal,
        })) {
          if (chunk.kind !== 'turn_items') {
            continue
          }

          commentaryTexts.push(
            ...chunk.turnItems
              .filter(
                item =>
                  item.kind === 'ui_message' &&
                  item.source === 'commentary',
              )
              .map(item => item.text),
          )
        }

        return {
          commentaryTexts,
        }
      },
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

async function runAssistantMessageDeltaWithoutAddedThenTool() {
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
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","item_id":"msg-delta-only","delta":"LOOKING CLOSER"}\n\n',
    )
    res.write(
      'event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"type":"function_call","call_id":"tool-delta-only","name":"Read","arguments":"{\\"file_path\\":\\"package.json\\"}"}}\n\n',
    )
    res.write(
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"tool-delta-only","name":"Read","arguments":"{\\"file_path\\":\\"package.json\\"}"}}\n\n',
    )
    res.write(
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-delta-only-tool"}}\n\n',
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
        ANTHROPIC_MODEL: 'gpt-5.4',
      },
      async () => {
        const commentaryTexts = []
        const turnItemKinds = []

        for await (const chunk of queryCodexResponsesStream({
          messages: [
            {
              type: 'user',
              uuid: 'user-1',
              message: { content: 'check delta only tool flush' },
            },
          ],
          systemPrompt: [],
          options: {},
          signal: new AbortController().signal,
        })) {
          if (chunk.kind !== 'turn_items') {
            continue
          }

          turnItemKinds.push(...chunk.turnItems.map(item => item.kind))
          commentaryTexts.push(
            ...chunk.turnItems
              .filter(
                item =>
                  item.kind === 'ui_message' &&
                  item.source === 'commentary',
              )
              .map(item => item.text),
          )
        }

        return {
          commentaryTexts,
          turnItemKinds,
        }
      },
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

async function runModelStreamingAddedPreambleOrdering() {
  const { callModelWithStreaming } = await import(
    '../../src/services/api/model.ts'
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
      'event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"type":"message","id":"msg-order","role":"assistant","phase":"commentary","content":[{"type":"output_text","text":"ORDERED_PREAMBLE"}]}}\n\n',
    )
    res.write(
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"tool-order","name":"Bash","arguments":"{\\"command\\":\\"pwd\\"}"}}\n\n',
    )
    res.write(
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-model-order"}}\n\n',
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
        ANTHROPIC_MODEL: 'gpt-5.4',
      },
      async () => {
        const assistantContents = []

        for await (const message of callModelWithStreaming({
          messages: [
            {
              type: 'user',
              uuid: 'user-1',
              message: { content: 'check streaming model ordering' },
            },
          ],
          systemPrompt: [],
          options: {},
          signal: new AbortController().signal,
        })) {
          assistantContents.push(
            message.message.content.map(part =>
              part.type === 'text' ? part.text : part.type,
            ),
          )
        }

        return {
          assistantContents,
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

  const bashTool = {
    name: 'Bash',
    prompt: async () => 'Run shell commands in the workspace',
    inputJSONSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
      },
      required: ['command'],
    },
  }

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
        systemPrompt: ['You are the developer instruction.'],
        options: {
          tools: [
            bashTool,
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
            effortValue: 'medium',
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

      const summaryOverrideBody = await withEnv(
        {
          CODEX_CODE_DEFAULT_REASONING_SUMMARY: 'auto',
        },
        async () => buildResponsesBody({
          messages: [
            {
              type: 'user',
              uuid: 'user-6',
              message: { content: 'summary override wins' },
            },
          ],
          systemPrompt: [],
          options: {
            model: 'gpt-5.4',
            effortValue: 'medium',
          },
        }),
      )

      return {
        inputRoles: (body.input ?? []).map(item => item.role ?? item.type),
        instructionsLength:
          typeof body.instructions === 'string' ? body.instructions.length : 0,
        toolNames: (body.tools ?? []).map(tool => tool.name ?? tool.type),
        localShellToolPresent:
          (body.tools ?? []).some(
            tool => tool.type === 'function' && tool.name === 'local_shell',
          ) ?? false,
        bashFunctionToolPresent:
          (body.tools ?? []).some(
            tool => tool.type === 'function' && tool.name === 'Bash',
          ) ?? false,
        webSearchTool: (body.tools ?? []).find(tool => tool.type === 'web_search') ?? null,
        xhighReasoning: xhighBody.reasoning ?? null,
        xhighText: xhighBody.text ?? null,
        unsupportedReasoning: unsupportedBody.reasoning ?? null,
        unsupportedText: unsupportedBody.text ?? null,
        configDefaultReasoning: configDefaultBody.reasoning ?? null,
        configDefaultText: configDefaultBody.text ?? null,
        sessionOverrideReasoning: sessionOverrideBody.reasoning ?? null,
        sessionOverrideText: sessionOverrideBody.text ?? null,
        summaryOverrideReasoning: summaryOverrideBody.reasoning ?? null,
      }
    },
  )
}

async function runFollowUpToolBody() {
  const { buildResponsesBody } = await import(
    '../../src/services/api/codexResponses.ts'
  )

  const bashTool = {
    name: 'Bash',
    prompt: async () => 'Run shell commands in the workspace',
    inputJSONSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
      },
      required: ['command'],
    },
  }

  return withEnv(
    {
      ANTHROPIC_MODEL: 'gpt-5.4',
    },
    async () => {
      const body = await buildResponsesBody({
        messages: [
          {
            type: 'user',
            uuid: 'user-follow-up-1',
            message: { content: 'inspect the repo' },
          },
          {
            type: 'assistant',
            uuid: 'assistant-follow-up-1',
            message: {
              content: [
                {
                  type: 'tool_use',
                  id: 'bash-follow-up-1',
                  name: 'Bash',
                  input: {
                    command: 'pwd',
                  },
                },
              ],
            },
          },
          {
            type: 'user',
            uuid: 'user-follow-up-2',
            message: {
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'bash-follow-up-1',
                  content: 'ok',
                },
              ],
            },
          },
        ],
        systemPrompt: ['You are the developer instruction.'],
        options: {
          tools: [
            bashTool,
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

      return {
        inputRoles: (body.input ?? []).map(item => item.role ?? item.type),
        instructionsLength:
          typeof body.instructions === 'string' ? body.instructions.length : 0,
        toolNames: (body.tools ?? []).map(tool => tool.name ?? tool.type),
        localShellToolPresent:
          (body.tools ?? []).some(
            tool => tool.type === 'function' && tool.name === 'local_shell',
          ) ?? false,
      }
    },
  )
}

async function runQueryToolForwarding() {
  const { queryCodexResponses } = await import(
    '../../src/services/api/codexResponses.ts'
  )

  const bashTool = {
    name: 'Bash',
    prompt: async () => 'Run shell commands in the workspace',
    inputJSONSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
      },
      required: ['command'],
    },
  }

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
          systemPrompt: ['You are the developer instruction.'],
          tools: [
            bashTool,
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
          inputRoles: (capturedBody?.input ?? []).map(
            item => item.role ?? item.type,
          ),
          toolNames: (capturedBody?.tools ?? []).map(
            tool => tool.name ?? tool.type,
          ),
          localShellToolPresent:
            (capturedBody?.tools ?? []).some(
              tool => tool.type === 'function' && tool.name === 'local_shell',
            ) ?? false,
          bashFunctionToolPresent:
            (capturedBody?.tools ?? []).some(
              tool => tool.type === 'function' && tool.name === 'Bash',
            ) ?? false,
          toolChoice: capturedBody?.tool_choice ?? null,
          parallelToolCalls: capturedBody?.parallel_tool_calls ?? null,
        }
      },
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

async function runApiErrorPrefix() {
  const { queryCodexResponses } = await import(
    '../../src/services/api/codexResponses.ts'
  )

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/responses') {
      res.writeHead(404).end('not found')
      return
    }

    res.writeHead(400, {
      'content-type': 'application/json',
    })
    res.end(
      JSON.stringify({
        error: {
          message: 'No tool call found for function call output with call_id call_test.',
        },
      }),
    )
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
      async () => queryCodexResponses({
        messages: [
          {
            type: 'user',
            uuid: 'user-1',
            message: { content: 'trigger api error' },
          },
        ],
        systemPrompt: [],
        options: {},
        signal: new AbortController().signal,
      }),
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

async function runOrphanToolResultPairing() {
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
            type: 'assistant',
            uuid: 'assistant-1',
            message: {
              content: [
                {
                  type: 'tool_use',
                  id: 'tool-1',
                  name: 'Read',
                  input: { file_path: 'README.md' },
                },
              ],
            },
          },
          {
            type: 'user',
            uuid: 'user-1',
            message: {
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'tool-1',
                  content: 'ok',
                },
              ],
            },
          },
          {
            type: 'user',
            uuid: 'user-2',
            message: {
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'tool-orphan',
                  content: 'orphan',
                },
              ],
            },
          },
        ],
        systemPrompt: [],
        options: {},
      })

      return {
        inputTypes: body.input.map(item => item.type),
        functionCallIds: body.input
          .filter(item => item.type === 'function_call')
          .map(item => item.call_id),
        functionCallOutputIds: body.input
          .filter(item => item.type === 'function_call_output')
          .map(item => item.call_id),
      }
    },
  )
}

async function runBashHistoryUsesLocalShellReplay() {
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
            type: 'assistant',
            uuid: 'assistant-bash-1',
            message: {
              content: [
                {
                  type: 'tool_use',
                  id: 'bash-call-1',
                  name: 'Bash',
                  input: {
                    command: 'pwd',
                    timeout: 2500,
                  },
                },
              ],
            },
          },
          {
            type: 'user',
            uuid: 'user-bash-1',
            message: {
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'bash-call-1',
                  content: 'ok',
                },
              ],
            },
          },
        ],
        systemPrompt: [],
        options: {},
      })

      return {
        inputTypes: body.input.map(item => item.type),
        functionCallItems: body.input.filter(item => item.type === 'function_call'),
        functionCallIds: body.input
          .filter(item => item.type === 'function_call')
          .map(item => item.call_id),
        functionCallOutputIds: body.input
          .filter(item => item.type === 'function_call_output')
          .map(item => item.call_id),
      }
    },
  )
}

async function runBashModelTurnItemsUseLocalShellReplay() {
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
            type: 'assistant',
            uuid: 'assistant-bash-turn-items-1',
            message: {
              content: [],
            },
            modelTurnItems: [
              {
                kind: 'raw_model_output',
                provider: 'custom',
                itemType: 'function_call',
                payload: {
                  type: 'function_call',
                  call_id: 'bash-turn-item-1',
                  name: 'Bash',
                  arguments: JSON.stringify({
                    command: 'pwd',
                    timeout: 2500,
                  }),
                },
              },
            ],
          },
          {
            type: 'user',
            uuid: 'user-bash-turn-items-1',
            message: {
              content: [],
            },
            modelTurnItems: [
              {
                kind: 'raw_model_output',
                provider: 'custom',
                itemType: 'function_call_output',
                payload: {
                  type: 'function_call_output',
                  call_id: 'bash-turn-item-1',
                  output: 'ok',
                },
              },
            ],
          },
        ],
        systemPrompt: [],
        options: {},
      })

      return {
        inputTypes: body.input.map(item => item.type),
        functionCallItems: body.input.filter(item => item.type === 'function_call'),
        functionCallIds: body.input
          .filter(item => item.type === 'function_call')
          .map(item => item.call_id),
        functionCallOutputIds: body.input
          .filter(item => item.type === 'function_call_output')
          .map(item => item.call_id),
      }
    },
  )
}

async function runMixedMessageAndReplayPrefersMessageContent() {
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
            type: 'assistant',
            uuid: 'assistant-mixed-1',
            message: {
              content: [
                {
                  type: 'text',
                  text: '我先看一下配置。',
                },
                {
                  type: 'tool_use',
                  id: 'mixed-call-1',
                  name: 'Bash',
                  input: {
                    command: 'cat package.json',
                  },
                },
              ],
            },
            modelTurnItems: [
              {
                kind: 'ui_message',
                source: 'commentary',
                text: '我先看一下配置。',
              },
              {
                kind: 'raw_model_output',
                provider: 'custom',
                itemType: 'function_call',
                payload: {
                  type: 'function_call',
                  call_id: 'mixed-call-1',
                  name: 'Bash',
                  arguments: JSON.stringify({
                    command: 'cat package.json',
                  }),
                },
              },
            ],
          },
        ],
        systemPrompt: [],
        options: {},
      })

      return {
        inputTypes: body.input.map(item => item.type),
        firstInput: body.input[0] ?? null,
        secondInput: body.input[1] ?? null,
      }
    },
  )
}

async function runFunctionCallArgumentsDeltaShellBridge() {
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
      'event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"id":"fc-shell-delta","type":"function_call","status":"in_progress","arguments":"","call_id":"tool-shell-delta","name":"shell"}}\n\n',
    )
    res.write(
      'event: response.function_call_arguments.delta\ndata: {"type":"response.function_call_arguments.delta","item_id":"fc-shell-delta","delta":"{\\"command\\":[\\"bash\\",\\"-lc\\",\\"pwd\\"],\\"workdir\\":\\"/tmp/project\\",\\"timeout_ms\\":1200}"}\n\n',
    )
    res.write(
      'event: response.function_call_arguments.done\ndata: {"type":"response.function_call_arguments.done","item_id":"fc-shell-delta","arguments":"{\\"command\\":[\\"bash\\",\\"-lc\\",\\"pwd\\"],\\"workdir\\":\\"/tmp/project\\",\\"timeout_ms\\":1200}"}\n\n',
    )
    res.write(
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"id":"fc-shell-delta","type":"function_call","status":"completed","arguments":"","call_id":"tool-shell-delta","name":"shell"}}\n\n',
    )
    res.write(
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-shell-delta"}}\n\n',
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
        ANTHROPIC_MODEL: 'gpt-5.4',
      },
      async () => {
        const result = await queryCodexResponses({
          messages: [
            {
              type: 'user',
              uuid: 'user-shell-delta-1',
              message: { content: 'bridge shell deltas' },
            },
          ],
          systemPrompt: [],
          options: {},
          signal: new AbortController().signal,
        })

        return {
          turnItemKinds: result.turnItems.map(item => item.kind),
          toolCall: result.turnItems.find(item => item.kind === 'tool_call') ?? null,
          localShellCall:
            result.turnItems.find(item => item.kind === 'local_shell_call') ?? null,
        }
      },
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

async function runRequestRetry() {
  const { queryCodexResponses } = await import(
    '../../src/services/api/codexResponses.ts'
  )

  let requestCount = 0
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/responses') {
      res.writeHead(404).end('not found')
      return
    }

    requestCount += 1
    if (requestCount === 1) {
      res.writeHead(500, {
        'content-type': 'application/json',
      })
      res.end(JSON.stringify({ error: { message: 'synthetic 500' } }))
      return
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      connection: 'keep-alive',
      'cache-control': 'no-cache',
    })
    res.write(
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"retried request ok"}]}}\n\n',
    )
    res.write(
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-request-retry"}}\n\n',
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
        CODEX_CODE_REQUEST_MAX_RETRIES: '1',
        CODEX_CODE_STREAM_MAX_RETRIES: '0',
      },
      async () => {
        const result = await queryCodexResponses({
          messages: [
            {
              type: 'user',
              uuid: 'user-1',
              message: { content: 'retry the request' },
            },
          ],
          systemPrompt: [],
          options: {},
          signal: new AbortController().signal,
        })

        return {
          requestCount,
          errorMessage: result.errorMessage ?? null,
          finalText:
            result.turnItems.find(item => item.kind === 'final_answer')?.text ??
            null,
        }
      },
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

async function runStreamRetryIncomplete() {
  const { queryCodexResponsesStream } = await import(
    '../../src/services/api/codexResponses.ts'
  )

  let requestCount = 0
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/responses') {
      res.writeHead(404).end('not found')
      return
    }

    requestCount += 1
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      connection: 'keep-alive',
      'cache-control': 'no-cache',
    })

    if (requestCount === 1) {
      res.end()
      return
    }

    res.write(
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"retried stream ok"}]}}\n\n',
    )
    res.write(
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-stream-retry"}}\n\n',
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
        CODEX_CODE_REQUEST_MAX_RETRIES: '0',
        CODEX_CODE_STREAM_MAX_RETRIES: '1',
      },
      async () => {
        const retryMessages = []
        const turnItems = []
        let errorMessage = null

        for await (const chunk of queryCodexResponsesStream({
          messages: [
            {
              type: 'user',
              uuid: 'user-1',
              message: { content: 'retry the stream' },
            },
          ],
          systemPrompt: [],
          options: {},
          signal: new AbortController().signal,
        })) {
          if (chunk.kind === 'retry') {
            retryMessages.push(chunk.message)
            continue
          }

          if (chunk.kind === 'api_error') {
            errorMessage = chunk.errorMessage
            continue
          }

          if (chunk.kind === 'turn_items') {
            turnItems.push(...chunk.turnItems)
          }
        }

        return {
          requestCount,
          retryMessages,
          errorMessage,
          finalText:
            turnItems.find(item => item.kind === 'final_answer')?.text ?? null,
        }
      },
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

async function runStreamRetryAfterPartialText() {
  const { queryCodexResponsesStream } = await import(
    '../../src/services/api/codexResponses.ts'
  )

  let requestCount = 0
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/responses') {
      res.writeHead(404).end('not found')
      return
    }

    requestCount += 1
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      connection: 'keep-alive',
      'cache-control': 'no-cache',
    })

    if (requestCount === 1) {
      res.write(
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"partial text"}\n\n',
      )
      res.write(
        'event: response.failed\ndata: {"type":"response.failed","response":{"error":{"code":"stream_read_error","message":"stream_read_error"}}}\n\n',
      )
      res.end('data: [DONE]\n\n')
      return
    }

    res.write(
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"retried after partial text"}\n\n',
    )
    res.write(
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"retried after partial text"}]}}\n\n',
    )
    res.write(
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-stream-read-retry"}}\n\n',
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
        CODEX_CODE_REQUEST_MAX_RETRIES: '0',
        CODEX_CODE_STREAM_MAX_RETRIES: '1',
      },
      async () => {
        const retryMessages = []
        const turnItems = []
        const deltaTexts = []
        let errorMessage = null

        for await (const chunk of queryCodexResponsesStream({
          messages: [
            {
              type: 'user',
              uuid: 'user-1',
              message: { content: 'retry after partial text' },
            },
          ],
          systemPrompt: [],
          options: {},
          signal: new AbortController().signal,
        })) {
          if (chunk.kind === 'retry') {
            retryMessages.push(chunk.message)
            continue
          }

          if (chunk.kind === 'api_error') {
            errorMessage = chunk.errorMessage
            continue
          }

          if (chunk.kind === 'stream_event' && chunk.event.type === 'content_block_delta') {
            if (
              chunk.event.delta &&
              typeof chunk.event.delta === 'object' &&
              'text' in chunk.event.delta &&
              typeof chunk.event.delta.text === 'string'
            ) {
              deltaTexts.push(chunk.event.delta.text)
            }
            continue
          }

          if (chunk.kind === 'turn_items') {
            turnItems.push(...chunk.turnItems)
          }
        }

        return {
          requestCount,
          retryMessages,
          errorMessage,
          deltaTexts,
          finalText:
            turnItems.find(item => item.kind === 'final_answer')?.text ?? null,
        }
      },
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

async function runStreamRetryUnexpectedEof() {
  const { queryCodexResponsesStream } = await import(
    '../../src/services/api/codexResponses.ts'
  )

  let requestCount = 0
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/responses') {
      res.writeHead(404).end('not found')
      return
    }

    requestCount += 1
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      connection: 'keep-alive',
      'cache-control': 'no-cache',
    })

    if (requestCount === 1) {
      res.write(
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"partial text"}\n\n',
      )
      res.end(
        'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message"',
      )
      return
    }

    res.write(
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"retried after eof"}\n\n',
    )
    res.write(
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"retried after eof"}]}}\n\n',
    )
    res.write(
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-stream-eof-retry"}}\n\n',
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
        CODEX_CODE_REQUEST_MAX_RETRIES: '0',
        CODEX_CODE_STREAM_MAX_RETRIES: '1',
      },
      async () => {
        const retryMessages = []
        const turnItems = []
        const deltaTexts = []
        let errorMessage = null

        for await (const chunk of queryCodexResponsesStream({
          messages: [
            {
              type: 'user',
              uuid: 'user-1',
              message: { content: 'retry after eof' },
            },
          ],
          systemPrompt: [],
          options: {},
          signal: new AbortController().signal,
        })) {
          if (chunk.kind === 'retry') {
            retryMessages.push(chunk.message)
            continue
          }

          if (chunk.kind === 'api_error') {
            errorMessage = chunk.errorMessage
            continue
          }

          if (
            chunk.kind === 'stream_event' &&
            chunk.event.type === 'content_block_delta' &&
            chunk.event.delta &&
            typeof chunk.event.delta === 'object' &&
            'text' in chunk.event.delta &&
            typeof chunk.event.delta.text === 'string'
          ) {
            deltaTexts.push(chunk.event.delta.text)
            continue
          }

          if (chunk.kind === 'turn_items') {
            turnItems.push(...chunk.turnItems)
          }
        }

        return {
          requestCount,
          retryMessages,
          errorMessage,
          deltaTexts,
          finalText:
            turnItems.find(item => item.kind === 'final_answer')?.text ?? null,
        }
      },
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

let result

switch (mode) {
  case 'merge':
    result = await runMerge()
    break
  case 'query':
    result = await runQuery()
    break
  case 'multiline-data-fallback':
    result = await runMultilineDataFallback()
    break
  case 'delta-without-indexes':
    result = await runDeltaWithoutIndexes()
    break
  case 'assistant-message-added-preamble':
    result = await runAssistantMessageAddedPreamble()
    break
  case 'assistant-message-added-and-done-dedupe':
    result = await runAssistantMessageAddedAndDoneDedupe()
    break
  case 'assistant-message-added-delta-then-tool':
    result = await runAssistantMessageAddedDeltaThenTool()
    break
  case 'assistant-message-empty-added-delta-then-tool':
    result = await runAssistantMessageEmptyAddedDeltaThenTool()
    break
  case 'assistant-message-empty-added-delta-tool-done-dedupe':
    result = await runAssistantMessageEmptyAddedDeltaToolDoneDedupe()
    break
  case 'assistant-message-delta-without-added-then-tool':
    result = await runAssistantMessageDeltaWithoutAddedThenTool()
    break
  case 'model-streaming-added-preamble-ordering':
    result = await runModelStreamingAddedPreambleOrdering()
    break
  case 'identity-default':
    result = await runIdentity(false)
    break
  case 'identity-enabled':
    result = await runIdentity(true)
    break
  case 'tool-body':
    result = await runToolBody()
    break
  case 'follow-up-tool-body':
    result = await runFollowUpToolBody()
    break
  case 'query-tool-forwarding':
    result = await runQueryToolForwarding()
    break
  case 'api-error-prefix':
    result = await runApiErrorPrefix()
    break
  case 'orphan-tool-result-pairing':
    result = await runOrphanToolResultPairing()
    break
  case 'bash-history-local-shell-replay':
    result = await runBashHistoryUsesLocalShellReplay()
    break
  case 'bash-model-turn-items-local-shell-replay':
    result = await runBashModelTurnItemsUseLocalShellReplay()
    break
  case 'mixed-message-and-replay-prefers-message-content':
    result = await runMixedMessageAndReplayPrefersMessageContent()
    break
  case 'function-call-arguments-delta-shell-bridge':
    result = await runFunctionCallArgumentsDeltaShellBridge()
    break
  case 'request-retry':
    result = await runRequestRetry()
    break
  case 'stream-retry-incomplete':
    result = await runStreamRetryIncomplete()
    break
  case 'stream-retry-after-partial-text':
    result = await runStreamRetryAfterPartialText()
    break
  case 'stream-retry-unexpected-eof':
    result = await runStreamRetryUnexpectedEof()
    break
  default:
    result = await runMissingBaseUrl()
    break
}

process.stdout.write(JSON.stringify(result))

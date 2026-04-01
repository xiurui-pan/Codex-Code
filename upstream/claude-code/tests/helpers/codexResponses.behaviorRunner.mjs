import http from 'node:http'
import { once } from 'node:events'

const mode = process.argv[2]

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
    '../../src/services/api/modelTurnItems.ts'
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
          turnItemKinds:
            assistantMessage.modelTurnItems?.map(item => item.kind) ?? [],
          content: assistantMessage.message.content.map(part =>
            part.type === 'text' ? part.text : part.type,
          ),
        }
      },
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

const result = mode === 'merge' ? await runMerge() : await runQuery()
process.stdout.write(JSON.stringify(result))

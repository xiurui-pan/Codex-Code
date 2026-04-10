import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { projectRoot } from './helpers/projectRoot.mjs'

const cwd = projectRoot

async function runBehavior(mode) {
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      '--loader',
      './dist/loader.mjs',
      './tests/helpers/codexResponses.behaviorRunner.mjs',
      mode,
    ],
    {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
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

  const [code] = await once(child, 'close')
  assert.equal(code, 0, stderr || `child exited with ${code}`)
  return JSON.parse(stdout)
}

test('mergeStreamedAssistantMessages preserves intermediate turn items', async () => {
  const result = await runBehavior('merge')

  assert.deepEqual(result.turnItemKinds, [
    'final_answer',
    'local_shell_call',
    'tool_call',
    'final_answer',
  ])
  assert.deepEqual(result.content, ['first', 'tool_use', 'second'])
})

test('queryCodexResponses aggregates streamed items instead of only returning the last assistant message', async () => {
  const result = await runBehavior('query')

  assert.deepEqual(
    result.turnItemKinds.filter(kind => kind !== 'raw_model_output'),
    [
      'tool_call',
      'local_shell_call',
      'final_answer',
    ],
  )
  assert.equal(
    result.turnItemKinds.filter(kind => kind === 'raw_model_output').length,
    2,
  )
  assert.notDeepEqual(result.turnItemKinds, [
    'tool_call',
    'local_shell_call',
    'final_answer',
  ])
  assert.equal(result.errorMessage, null)
})

test('request identity metadata and custom session header stay opt-in', async () => {
  const defaultResult = await runBehavior('identity-default')

  assert.equal('x-codex-code-session-id' in defaultResult.headers, false)
  assert.equal(defaultResult.metadata, null)
  assert.equal(defaultResult.bodyMetadata, null)
  assert.match(defaultResult.headers['user-agent'] ?? '', /^codex-code\//)

  const enabledResult = await runBehavior('identity-enabled')

  assert.match(enabledResult.headers['x-codex-code-session-id'] ?? '', /.+/)
  assert.equal(enabledResult.metadata?.originator, 'codex-code')
  assert.equal(enabledResult.bodyMetadata?.originator, 'codex-code')
})

test('missing base URL error points to configured Codex base URL sources', async () => {
  const result = await runBehavior('missing-base-url')

  assert.match(
    result.errorMessage ?? '',
    /configured base URL \(\.codex model_providers\.<id>\.base_url \/ ANTHROPIC_BASE_URL\)/,
  )
})

test('responses body keeps the full tool surface while sending the system prompt through a leading developer message', async () => {
  const result = await runBehavior('tool-body')

  assert.deepEqual(result.inputRoles.slice(0, 2), ['developer', 'user'])
  assert.equal(result.instructionsLength, 0)
  assert.ok(result.toolNames.includes('ReadAllFiles'))
  assert.ok(result.toolNames.includes('local_shell'))
  assert.equal(result.localShellToolPresent, true)
  assert.equal(result.bashFunctionToolPresent, false)
  assert.equal(result.webSearchTool?.type, 'web_search')
  assert.deepEqual(result.webSearchTool?.filters?.allowed_domains, [
    'example.com',
  ])
  assert.deepEqual(result.xhighReasoning, {
    effort: 'xhigh',
  })
  assert.deepEqual(result.xhighText, { verbosity: 'low' })
  assert.equal(result.unsupportedReasoning, null)
  assert.equal(result.unsupportedText, null)
  assert.deepEqual(result.configDefaultReasoning, {
    effort: 'medium',
  })
  assert.deepEqual(result.configDefaultText, { verbosity: 'low' })
  assert.deepEqual(result.sessionOverrideReasoning, {
    effort: 'high',
  })
  assert.deepEqual(result.sessionOverrideText, { verbosity: 'low' })
  assert.deepEqual(result.summaryOverrideReasoning, {
    effort: 'medium',
    summary: 'auto',
  })
})

test('responses body keeps the same full tool surface after a tool round-trip', async () => {
  const result = await runBehavior('follow-up-tool-body')

  assert.deepEqual(result.inputRoles.slice(0, 3), [
    'developer',
    'user',
    'function_call',
  ])
  assert.equal(result.instructionsLength, 0)
  assert.ok(result.toolNames.includes('ReadAllFiles'))
  assert.ok(result.toolNames.includes('local_shell'))
  assert.equal(result.localShellToolPresent, true)
})

test('queryCodexResponses forwards the full tool surface into the Responses request body', async () => {
  const result = await runBehavior('query-tool-forwarding')

  assert.deepEqual(result.inputRoles.slice(0, 2), ['developer', 'user'])
  assert.ok(result.toolNames.includes('ReadAllFiles'))
  assert.ok(result.toolNames.includes('local_shell'))
  assert.equal(result.localShellToolPresent, true)
  assert.equal(result.bashFunctionToolPresent, false)
  assert.equal(result.toolChoice, 'auto')
  assert.equal(result.parallelToolCalls, true)
})

test('queryCodexResponses tolerates split JSON across multiple SSE data lines', async () => {
  const result = await runBehavior('multiline-data-fallback')

  assert.equal(result.errorMessage, null)
  assert.deepEqual(result.turnItemKinds, ['raw_model_output', 'final_answer'])
  assert.equal(result.finalText, 'claude')
})

test('queryCodexResponsesStream synthesizes streaming text blocks when delta events omit indexes', async () => {
  const result = await runBehavior('delta-without-indexes')

  assert.deepEqual(result.eventTypes, [
    'content_block_start',
    'content_block_delta',
    'content_block_delta',
  ])
  assert.deepEqual(result.eventIndexes, [0, 0, 0])
  assert.deepEqual(result.deltaTexts, ['FIRST_STREAM_OK', ' SECOND_DONE'])
})

test('queryCodexResponsesStream surfaces assistant text seeded from output_item.added', async () => {
  const result = await runBehavior('assistant-message-added-preamble')

  assert.deepEqual(result.eventTypes, [
    'content_block_start',
    'content_block_delta',
  ])
  assert.deepEqual(result.deltaTexts, ['PREAMBLE_FROM_ADDED'])
  assert.deepEqual(result.commentaryTexts, ['PREAMBLE_FROM_ADDED'])
  assert.deepEqual(
    result.turnItemKinds.filter(kind => kind !== 'raw_model_output'),
    ['ui_message', 'tool_call', 'local_shell_call'],
  )
  assert.ok(result.turnItemKinds.includes('tool_call'))
})

test('queryCodexResponsesStream does not duplicate assistant text when the same message later arrives in output_item.done', async () => {
  const result = await runBehavior('assistant-message-added-and-done-dedupe')

  assert.deepEqual(result.commentaryTexts, ['DEDUPE_ME'])
})

test('queryCodexResponsesStream flushes the latest added assistant text before a later tool call', async () => {
  const result = await runBehavior('assistant-message-added-delta-then-tool')

  assert.deepEqual(result.commentaryTexts, ['LOOKING CLOSER'])
  assert.deepEqual(
    result.turnItemKinds.filter(kind => kind !== 'raw_model_output'),
    ['ui_message', 'tool_call', 'local_shell_call'],
  )
})

test('queryCodexResponsesStream flushes assistant text when added starts empty and delta arrives before a tool call', async () => {
  const result = await runBehavior('assistant-message-empty-added-delta-then-tool')

  assert.deepEqual(result.commentaryTexts, ['LOOKING CLOSER'])
  assert.deepEqual(
    result.turnItemKinds.filter(kind => kind !== 'raw_model_output'),
    ['ui_message', 'tool_call', 'local_shell_call'],
  )
})

test('queryCodexResponsesStream does not duplicate assistant text after an empty added item was flushed before tool use', async () => {
  const result = await runBehavior(
    'assistant-message-empty-added-delta-tool-done-dedupe',
  )

  assert.deepEqual(result.commentaryTexts, ['LOOKING CLOSER'])
})

test('queryCodexResponsesStream persists delta-only assistant preambles before later tool calls', async () => {
  const result = await runBehavior(
    'assistant-message-delta-without-added-then-tool',
  )

  assert.deepEqual(result.commentaryTexts, ['LOOKING CLOSER'])
  assert.deepEqual(
    result.turnItemKinds.filter(kind => kind !== 'raw_model_output'),
    ['ui_message', 'tool_call'],
  )
})

test('streaming model adapter emits the added preamble as an assistant message before tool_use content', async () => {
  const result = await runBehavior('model-streaming-added-preamble-ordering')

  assert.deepEqual(result.assistantContents, [
    ['ORDERED_PREAMBLE'],
    ['tool_use'],
  ])
})

test('custom codex provider HTTP failures are normalized into API Error messages', async () => {
  const result = await runBehavior('api-error-prefix')

  assert.match(result.errorMessage ?? '', /^API Error: /)
  assert.match(
    result.errorMessage ?? '',
    /No tool call found for function call output/,
  )
})

test('responses request builder drops orphan function_call_output entries from history', async () => {
  const result = await runBehavior('orphan-tool-result-pairing')

  assert.deepEqual(result.functionCallIds, ['tool-1'])
  assert.deepEqual(result.functionCallOutputIds, ['tool-1'])
  assert.equal(result.inputTypes.includes('function_call_output'), true)
  assert.equal(result.functionCallOutputIds.includes('tool-orphan'), false)
})

test('responses request builder replays Bash history on the local_shell function path', async () => {
  const result = await runBehavior('bash-history-local-shell-replay')

  assert.deepEqual(result.inputTypes, ['function_call', 'function_call_output'])
  assert.deepEqual(result.functionCallIds, ['bash-call-1'])
  assert.deepEqual(result.functionCallOutputIds, ['bash-call-1'])
  assert.deepEqual(result.functionCallItems, [
    {
      type: 'function_call',
      call_id: 'bash-call-1',
      name: 'local_shell',
      arguments: JSON.stringify({
        command: ['bash', '-lc', 'pwd'],
        timeout_ms: 2500,
      }),
    },
  ])
})

test('responses request builder rewrites persisted shell history back onto the local_shell function path', async () => {
  const result = await runBehavior('bash-model-turn-items-local-shell-replay')

  assert.deepEqual(result.inputTypes, ['function_call', 'function_call_output'])
  assert.deepEqual(result.functionCallIds, ['bash-turn-item-1'])
  assert.deepEqual(result.functionCallOutputIds, ['bash-turn-item-1'])
  assert.deepEqual(result.functionCallItems, [
    {
      type: 'function_call',
      call_id: 'bash-turn-item-1',
      name: 'local_shell',
      arguments: JSON.stringify({
        command: ['bash', '-lc', 'pwd'],
        timeout_ms: 2500,
      }),
    },
  ])
})

test('responses request builder prefers normalized message content over raw replay items for ordinary turns', async () => {
  const result = await runBehavior(
    'mixed-message-and-replay-prefers-message-content',
  )

  assert.deepEqual(result.inputTypes.slice(0, 2), ['message', 'function_call'])
  assert.deepEqual(result.firstInput, {
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'output_text',
        text: '我先看一下配置。',
      },
    ],
  })
  assert.deepEqual(result.secondInput, {
    type: 'function_call',
    call_id: 'mixed-call-1',
    name: 'local_shell',
    arguments: JSON.stringify({
      command: ['bash', '-lc', 'cat package.json'],
    }),
  })
})

test('responses stream patches shell function_call arguments from delta events before bridging to Bash', async () => {
  const result = await runBehavior('function-call-arguments-delta-shell-bridge')

  assert.deepEqual(
    result.turnItemKinds.filter(kind => kind !== 'raw_model_output'),
    ['tool_call', 'local_shell_call'],
  )
  assert.deepEqual(result.toolCall, {
    kind: 'tool_call',
    provider: 'custom',
    toolUseId: 'tool-shell-delta',
    toolName: 'Bash',
    input: {
      command: 'cd /tmp/project && pwd',
      timeout: 1200,
    },
    source: 'structured',
  })
  assert.deepEqual(result.localShellCall, {
    kind: 'local_shell_call',
    provider: 'custom',
    toolUseId: 'tool-shell-delta',
    toolName: 'Bash',
    command: 'cd /tmp/project && pwd',
    phase: 'requested',
    source: 'provider',
  })
})

test('custom codex provider retries a failed request before surfacing an error', async () => {
  const result = await runBehavior('request-retry')

  assert.equal(result.requestCount, 2)
  assert.equal(result.errorMessage, null)
  assert.equal(result.finalText, 'retried request ok')
})

test('custom codex provider retries an incomplete SSE stream and emits reconnect progress', async () => {
  const result = await runBehavior('stream-retry-incomplete')

  assert.equal(result.requestCount, 2)
  assert.deepEqual(result.retryMessages, ['Reconnecting... 1/1'])
  assert.equal(result.errorMessage, null)
  assert.equal(result.finalText, 'retried stream ok')
})

test('custom codex provider retries stream_read_error after partial text output', async () => {
  const result = await runBehavior('stream-retry-after-partial-text')

  assert.equal(result.requestCount, 2)
  assert.deepEqual(result.retryMessages, ['Reconnecting... 1/1'])
  assert.equal(result.errorMessage, null)
  assert.equal(result.finalText, 'retried after partial text')
  assert.deepEqual(result.deltaTexts, ['partial text', 'retried after partial text'])
})

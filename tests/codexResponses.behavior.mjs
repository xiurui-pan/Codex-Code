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

test('responses body keeps harness tools exposed and maps native web search for Codex', async () => {
  const result = await runBehavior('tool-body')

  assert.ok(result.toolNames.includes('ReadAllFiles'))
  assert.equal(result.webSearchTool?.type, 'web_search')
  assert.deepEqual(result.webSearchTool?.filters?.allowed_domains, [
    'example.com',
  ])
  assert.deepEqual(result.xhighReasoning, {
    effort: 'xhigh',
    summary: 'auto',
  })
  assert.equal(result.unsupportedReasoning, null)
  assert.deepEqual(result.configDefaultReasoning, {
    effort: 'medium',
    summary: 'auto',
  })
  assert.deepEqual(result.sessionOverrideReasoning, {
    effort: 'high',
    summary: 'auto',
  })
})

test('queryCodexResponses forwards top-level tools into the Responses request body', async () => {
  const result = await runBehavior('query-tool-forwarding')

  assert.ok(result.toolNames.includes('ReadAllFiles'))
  assert.equal(result.toolChoice, 'auto')
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

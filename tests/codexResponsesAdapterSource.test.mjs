import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { projectRoot } from './helpers/projectRoot.mjs'
import { join } from 'node:path'

const SOURCE_PATH = join(projectRoot, 'src/services/api/codexResponses.ts')

test('codex responses stream consumes output_text delta events for live text streaming', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8')

  assert.match(source, /event\.type === 'response\.output_text\.delta'/)
  assert.match(source, /type: 'content_block_delta'/)
  assert.match(source, /type: 'text_delta'/)
})

test('codex responses stream starts text rendering from content_part added events', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8')

  assert.match(source, /event\.type === 'response\.content_part\.added'/)
  assert.match(source, /type: 'content_block_start'/)
  assert.match(source, /type: 'text'/)
})

test('codex responses stream normalizes status-less web search done events to completed', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8')

  assert.match(
    source,
    /event\.item\.type === 'web_search_call' && !event\.item\.status/,
  )
  assert.match(source, /status: 'completed'/)
})

test('codex responses stream extends timeouts when WebSearch or WebFetch is exposed', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8')

  assert.match(source, /DEFAULT_NETWORK_TOOL_TIMEOUT_MS = 90_000/)
  assert.match(source, /tool\.name === 'WebSearch' \|\| tool\.name === 'WebFetch'/)
})

test('codex responses adapter replaces local WebSearch function tool with native web_search', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8')

  assert.match(source, /tools\.filter\(tool => tool\.name !== 'WebSearch'\)/)
  assert.match(source, /type: 'web_search'/)
  assert.match(source, /external_web_access: mode === 'live'/)
})

test('codex responses adapter sends function_call_output as plain text output', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8')

  assert.match(source, /type: 'function_call_output'/)
  assert.match(source, /output: getLocalExecutionOutputText\(turnItems\)/)
})

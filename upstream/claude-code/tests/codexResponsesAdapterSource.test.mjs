import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const SOURCE_PATH =
  '/home/pxr/workspace/CodingAgent/Codex-Code/upstream/claude-code/src/services/api/codexResponses.ts'

test('codex responses stream surfaces tool-start progress for function_call added events', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8')

  assert.equal(source.includes("source: 'tool_call_started'"), true)
  assert.match(source, /event\.item\.type === 'function_call'/)
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

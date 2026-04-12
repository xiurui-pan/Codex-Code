import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('tool execution stores compacted read payloads instead of full content duplicates', () => {
  const source = readFileSync(
    new URL('../src/services/tools/toolExecution.ts', import.meta.url),
    'utf8',
  )
  assert.ok(source.includes('compactToolUseResultForStorage'))
  assert.ok(source.includes('summarizeStoredToolResult'))
  assert.ok(source.includes('modelOutputTextOverride'))
  assert.ok(source.includes('storedToolUseResult'))
})

test('session storage compacts loaded heavy tool payloads in memory', () => {
  const source = readFileSync(
    new URL('../src/utils/sessionStorage.ts', import.meta.url),
    'utf8',
  )
  assert.ok(source.includes('compactLoadedToolResultPayload'))
  assert.ok(source.includes('summarizeStoredToolResult'))
  assert.ok(source.includes('summarizeStoredOutputText'))
})

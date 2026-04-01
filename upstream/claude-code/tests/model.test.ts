import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

async function readModelSource(): Promise<string> {
  const modelPath = fileURLToPath(
    new URL('../src/services/api/model.ts', import.meta.url),
  )
  return readFile(modelPath, 'utf8')
}

async function readCodexResponsesSource(): Promise<string> {
  const sourcePath = fileURLToPath(
    new URL('../src/services/api/codexResponses.ts', import.meta.url),
  )
  return readFile(sourcePath, 'utf8')
}

test('model entry no longer imports claude facade or ANTHROPIC_MODEL', async () => {
  const source = await readModelSource()

  assert.equal(source.includes("'./claude.js'"), false)
  assert.equal(source.includes('ANTHROPIC_MODEL'), false)
})

test('model entry keeps codex-only local usage and token helpers', async () => {
  const source = await readModelSource()

  assert.equal(source.includes('getContextMaxOutputTokens'), true)
  assert.equal(source.includes('export const updateModelUsage'), true)
  assert.equal(source.includes('export const accumulateModelUsage'), true)
  assert.equal(source.includes('getCodexConfiguredModel'), true)
})

test('non-streaming codex path aggregates streamed turn items instead of only keeping the last message', async () => {
  const source = await readCodexResponsesSource()

  assert.equal(source.includes('mergeStreamedAssistantMessages'), true)
  assert.equal(source.includes('lastAssistantMessage = assistantMessage'), false)
})

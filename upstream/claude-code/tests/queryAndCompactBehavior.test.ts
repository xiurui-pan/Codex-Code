import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

async function readSource(path: string): Promise<string> {
  return readFile(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

test('query turn-item path prefers plain assistant text when no tool_call exists', async () => {
  const source = await readSource('../src/query.ts')

  assert.equal(source.includes('const hasToolCall = turnChunk.turnItems.some('), true)
  assert.equal(source.includes('!hasToolCall && finalAnswerText'), true)
  assert.equal(source.includes('createAssistantMessage({'), true)
})

test('compact summary helper prefers modelTurnItems final answer text', async () => {
  const source = await readSource('../src/services/compact/compact.ts')

  assert.equal(source.includes('function getCompactSummaryText(message: AssistantMessage): string | null'), true)
  assert.equal(source.includes('extractFinalAnswerTextFromTurnItems(message.modelTurnItems).trim()'), true)
  assert.equal(source.includes('summary = getCompactSummaryText(summaryResponse)'), true)
})

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
  assert.equal(source.includes('export const callModelPreferredWithStreaming'), true)
  assert.equal(source.includes('export const callModelPayloadWithStreaming'), true)
  assert.equal(source.includes('export const callModelPreferredWithoutStreaming'), true)
  assert.equal(source.includes('export const callModelPayloadWithoutStreaming'), true)
  assert.equal(source.includes('export const callModelTurnWithoutStreaming'), true)
  assert.equal(source.includes('export const callSmallModelPreferred'), true)
  assert.equal(source.includes('export const callSmallModelPayload'), true)
  assert.equal(source.includes('export const callSmallModelTurn'), true)
  assert.equal(source.includes("'./preferredAssistantResponse.js'"), true)
  assert.equal(source.includes('createSyntheticPayloadFromTurnItems'), false)
})

test('codex responses entry now returns raw turn-item chunks and leaves assistant-shell compatibility to outer layers', async () => {
  const source = await readCodexResponsesSource()

  assert.equal(source.includes("kind: 'turn_items'"), true)
  assert.equal(source.includes('mergeStreamedAssistantMessages'), false)
  assert.equal(source.includes('codex-synthetic'), false)
})

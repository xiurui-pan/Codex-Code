import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

async function readCompactSource(): Promise<string> {
  const sourcePath = fileURLToPath(
    new URL('../src/services/compact/compact.ts', import.meta.url),
  )
  return readFile(sourcePath, 'utf8')
}

test('compact now consumes preferred model streaming before wrapping assistant shell', async () => {
  const source = await readCompactSource()

  assert.equal(source.includes('callModelPreferredWithStreaming'), true)
  assert.equal(source.includes('callModelWithStreaming'), false)
  assert.equal(
    source.includes('createSyntheticAssistantPayloadFromPreferredContent'),
    true,
  )
  assert.equal(source.includes('createAssistantMessageFromSyntheticPayload'), true)
})

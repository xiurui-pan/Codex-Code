import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

async function readRemotePermissionBridgeSource(): Promise<string> {
  const sourcePath = fileURLToPath(
    new URL('../src/remote/remotePermissionBridge.ts', import.meta.url),
  )
  return readFile(sourcePath, 'utf8')
}

test('remote permission bridge builds a payload before wrapping an assistant message', async () => {
  const source = await readRemotePermissionBridgeSource()

  assert.equal(source.includes('createRemotePermissionPayload'), true)
  assert.equal(source.includes('createRemotePermissionAssistantMessage'), true)
  assert.equal(source.includes('createAssistantMessageFromSyntheticPayload'), true)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

async function readHelperSource(): Promise<string> {
  const helperPath = fileURLToPath(
    new URL('../src/utils/hooks/apiQueryHookHelper.ts', import.meta.url),
  )
  return readFile(helperPath, 'utf8')
}

test('apiQueryHookHelper success path no longer reads legacy response.message.id', async () => {
  const source = await readHelperSource()

  assert.equal(source.includes('messageId: response.message.id'), false)
  assert.equal(source.includes('messageId: uuid'), true)
})

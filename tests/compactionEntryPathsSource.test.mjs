import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('manual and auto compaction only try session memory in summary mode', async () => {
  const [commandSource, autoSource] = await Promise.all([
    readFile('src/commands/compact/compact.ts', 'utf8'),
    readFile('src/services/compact/autoCompact.ts', 'utf8'),
  ])

  assert.match(commandSource, /trySessionMemoryCompaction/)
  assert.match(autoSource, /trySessionMemoryCompaction/)
  assert.match(commandSource, /compactionMode \?\? 'summary'\) === 'summary'/)
  assert.match(autoSource, /compactionMode \?\? 'summary'\) === 'summary'/)
})

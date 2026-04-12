import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('manual and auto compaction only try session memory in summary mode', async () => {
  const [commandSource, autoSource, configSource] = await Promise.all([
    readFile('src/commands/compact/compact.ts', 'utf8'),
    readFile('src/services/compact/autoCompact.ts', 'utf8'),
    readFile('src/utils/config.ts', 'utf8'),
  ])

  assert.match(commandSource, /trySessionMemoryCompaction/)
  assert.match(autoSource, /trySessionMemoryCompaction/)
  assert.match(commandSource, /getEffectiveCompactionMode\(\) === 'summary'/)
  assert.match(autoSource, /getEffectiveCompactionMode\(\) === 'summary'/)
  assert.match(configSource, /function getDefaultCompactionMode\(\): CompactionMode \{\s*return currentStageDisableGitAwareConfig \? 'responses' : 'summary'/s)
})

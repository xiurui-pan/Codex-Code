import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

function readSource(path) {
  return readFileSync(join(projectRoot, path), 'utf8')
}

test('harness incomplete-task auto-continue only runs on the main thread, not subagents', () => {
  const source = readSource('src/query.ts')

  assert.match(
    source,
    /Main-thread only: subagents share the parent session\/task context/,
  )
  assert.match(source, /if \(!toolUseContext\.agentId\) \{\s+const taskListId = getTaskListId\(\)/)
  assert.match(source, /transition: \{ reason: 'harness_incomplete_tasks', attempt \}/)
})

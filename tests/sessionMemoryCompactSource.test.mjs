import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

const source = readFileSync(
  join(projectRoot, 'src/services/compact/sessionMemoryCompact.ts'),
  'utf8',
)
const commandSource = readFileSync(
  join(projectRoot, 'src/commands/compact/compact.ts'),
  'utf8',
)

test('session-memory compaction records the real trigger and estimated pre-compact tokens', () => {
  assert.match(source, /const preCompactTokenCount = tokenCountWithEstimation\(messages\)/)
  assert.match(source, /createCompactBoundaryMessage\(\s*trigger,\s*preCompactTokenCount \?\? 0,/s)
  assert.match(
    source,
    /export async function trySessionMemoryCompaction\(\s*messages: Message\[\],\s*agentId\?: AgentId,\s*autoCompactThreshold\?: number,\s*trigger: 'manual' \| 'auto' = 'auto',/s,
  )
})

test('manual compact refreshes session memory before using session-memory compaction', () => {
  assert.match(commandSource, /manuallyExtractSessionMemory/)
  assert.match(
    commandSource,
    /const extractionResult = await manuallyExtractSessionMemory\(\s*messages,\s*context,\s*\)/s,
  )
  assert.match(
    commandSource,
    /if \(!extractionResult\.success\) \{\s*throw new Error\(/s,
  )
  assert.match(
    commandSource,
    /const sessionMemoryResult = await trySessionMemoryCompaction\(/s,
  )
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

function readSource(path) {
  return readFileSync(join(projectRoot, path), 'utf8')
}

test('system prompt now tells the model to stop after enough evidence and avoid file-dump scripts', () => {
  const source = readSource('src/constants/prompts.ts')

  assert.match(
    source,
    /Once a search or single-fact check answers the question, stop\./,
  )
  assert.match(
    source,
    /Do not use Bash or inline Python or Node scripts to dump file contents/,
  )
  assert.match(
    source,
    /If a task runs long or needs many tool calls, send brief progress updates at reasonable intervals/,
  )
})

test('tool efficiency source keeps only duplicate-check logic and no host-written progress text', () => {
  const source = readSource('src/services/tools/toolEfficiency.ts')

  assert.doesNotMatch(source, /buildSyntheticToolPreamble/)
  assert.doesNotMatch(source, /先做一轮定向检查，再收束结论。/)
  assert.doesNotMatch(source, /已经有初步结论了/)
  assert.doesNotMatch(source, /Tool-efficiency reminder:/)
  assert.doesNotMatch(source, /send one short progress update/)
})

test('agent prompt now defaults to local work and avoids proactive delegation', () => {
  const source = readSource('src/tools/AgentTool/prompt.ts')

  assert.match(source, /Default to local work first\./)
  assert.match(
    source,
    /Do not spawn an agent just because the task sounds thorough or research-heavy\./,
  )
  assert.match(
    source,
    /Do not use an agent proactively unless the current request clearly benefits from delegation/,
  )
})

test('query loop no longer injects host-written progress notes or reminder messages', () => {
  const source = readSource('src/query.ts')

  assert.doesNotMatch(source, /buildToolEfficiencyReminder/)
  assert.doesNotMatch(source, /buildSyntheticToolPreamble/)
  assert.doesNotMatch(source, /syntheticToolPreambleMessage/)
  assert.doesNotMatch(source, /one short progress sentence/)
})

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
    /If you still need another tool after a silent stretch, send one short progress update first/,
  )
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

test('query loop emits a visible pre-tool progress note and still keeps the silent-stretch reminder', () => {
  const source = readSource('src/query.ts')

  assert.match(source, /buildToolEfficiencyReminder/)
  assert.match(source, /buildSyntheticToolPreamble/)
  assert.match(source, /createAssistantMessage\(\{\s*content: syntheticToolPreamble,/s)
  assert.match(
    source,
    /avoid repeating the same fact checks, and only send one short progress sentence/,
  )
})

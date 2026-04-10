import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

function readSource(path) {
  return readFileSync(join(projectRoot, path), 'utf8')
}

test('thinking defaults align codex provider gpt-5.4 with codex-rs reasoning summary none', () => {
  const source = readSource('src/utils/thinking.ts')

  assert.match(source, /const canonical = model\.toLowerCase\(\)/)
  assert.ok(source.includes("canonical.includes('gpt-5.4')"))
  assert.ok(source.includes("canonical.includes('gpt-5.3-codex')"))
  assert.ok(source.includes("canonical.includes('gpt-5.1-codex')"))
  assert.doesNotMatch(source, /createRequire\(import\.meta\.url\)/)
  assert.ok(source.includes('return false'))
})

test('QueryEngine no longer hardcodes adaptive thinking for the codex provider', () => {
  const source = readSource('src/QueryEngine.ts')

  assert.doesNotMatch(
    source,
    /currentPhaseCustomCodexProvider\\s*\\?\\s*\\{ type: 'adaptive' \\}/,
  )
  assert.match(source, /shouldEnableThinkingByDefault\(initialMainLoopModel\)/)
})

test('codex responses defaults align gpt-5.4 and gpt-5.3-codex with codex-rs request defaults', () => {
  const modelSource = readSource('src/utils/model/codexModels.ts')
  const responsesSource = readSource('src/services/api/codexResponses.ts')

  assert.match(modelSource, /value: 'gpt-5\.4'[\s\S]*defaultReasoningSummary: 'none'/)
  assert.match(modelSource, /value: 'gpt-5\.4'[\s\S]*defaultVerbosity: 'low'/)
  assert.match(modelSource, /value: 'gpt-5\.3-codex'[\s\S]*defaultReasoningSummary: 'none'/)
  assert.match(modelSource, /value: 'gpt-5\.3-codex'[\s\S]*defaultVerbosity: 'low'/)
  assert.match(responsesSource, /getResponsesReasoningSummary/)
  assert.match(responsesSource, /getResponsesTextControls/)
  assert.doesNotMatch(responsesSource, /summary: 'auto'/)
})

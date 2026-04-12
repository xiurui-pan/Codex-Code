import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = new URL('..', import.meta.url)

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot.pathname, relativePath), 'utf8')
}

test('codex-only startup does not inherit Claude settings effort', () => {
  const source = readSource('src/utils/effort.ts')

  assert.match(
    source,
    /export function getInitialEffortSetting\(\): EffortLevel \| undefined \{\s*if \(isCurrentPhaseCustomCodexProvider\(\)\) \{\s*[\s\S]*return undefined\s*\}/,
  )
  assert.match(source, /return toPersistableEffort\(getInitialSettings\(\)\.effortLevel\)/)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function readSource(path) {
  return readFileSync(join('/home/pxr/workspace/CodingAgent/Codex-Code/upstream/claude-code', path), 'utf8')
}

test('StatusLine replaces explicit context N/A placeholders with live context usage', () => {
  const source = readSource('src/components/StatusLine.tsx')

  assert.match(source, /function buildContextWindowSummary/)
  assert.match(source, /if \(\/🧠\\s\*N\\\/A\\b\/\.test\(text\)\)/)
  assert.match(source, /return text\.replace\(\/🧠\\s\*N\\\/A\\b\/g, contextSummary\)/)
})

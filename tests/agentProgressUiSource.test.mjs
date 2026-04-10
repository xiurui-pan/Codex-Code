import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

function readSource(path) {
  return readFileSync(join(projectRoot, path), 'utf8')
}

test('Agent progress rows stay on one line and truncate long text', () => {
  const source = readSource('src/components/AgentProgressLine.tsx')

  assert.match(source, /<Box paddingLeft=\{3\} flexDirection="row">/)
  assert.match(source, /<Box flexShrink=\{1\}>/)
  assert.match(source, /wrap="truncate-end"/)
  assert.match(source, /modelTag && <> · \{modelTag\}<\/>/)
})

test('Agent summary row truncates instead of wrapping shortcut fragments', () => {
  const source = readSource('src/tools/AgentTool/UI.tsx')

  assert.match(source, /<Box flexShrink=\{1\}>/)
  assert.match(source, /<Text wrap="truncate-end">/)
  assert.match(source, /<KeyboardShortcutHint shortcut="↓" action="manage" parens \/>/)
  assert.match(source, /getAgentToolUseModelTag\(parsedInput\.data, getMainLoopModel\(\)\)/)
  assert.match(source, /modelTag=\{stat\.modelTag\}/)
})

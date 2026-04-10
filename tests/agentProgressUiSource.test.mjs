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

  assert.match(source, /<Box flexDirection="column" width="100%">/)
  assert.match(source, /<Box paddingLeft=\{3\} flexDirection="row" width="100%">/)
  assert.match(source, /<Box flexGrow=\{1\} flexShrink=\{1\} minWidth=\{0\}>/)
  assert.match(source, /wrap="truncate-end"/)
  assert.match(source, /modelTag && <> · \{modelTag\}<\/>/)
})

test('Agent summary row truncates instead of wrapping shortcut fragments', () => {
  const source = readSource('src/tools/AgentTool/UI.tsx')

  assert.match(source, /<Box flexDirection="column" marginTop=\{1\} width="100%">/)
  assert.match(source, /<Box flexDirection="row" width="100%" gap=\{1\}>/)
  assert.match(source, /<Box flexGrow=\{1\} flexShrink=\{1\} minWidth=\{0\}>/)
  assert.match(source, /<Text wrap="truncate-end">/)
  assert.match(source, /<KeyboardShortcutHint shortcut="↓" action="manage" parens \/>/)
  assert.match(source, /getAgentToolUseModelTag\(parsedInput\.data, getMainLoopModel\(\)\)/)
  assert.match(source, /modelTag=\{stat\.modelTag\}/)
})

test('Collapsed read-search rows use the same stable width constraints', () => {
  const source = readSource('src/components/messages/CollapsedReadSearchContent.tsx')

  assert.match(source, /<Box flexDirection="column" marginTop=\{1\} backgroundColor=\{bg\} width="100%">/)
  assert.match(source, /<Box flexDirection="row" width="100%" gap=\{1\}>/)
  assert.match(source, /<Box flexGrow=\{1\} flexShrink=\{1\} minWidth=\{0\}>/)
  assert.match(source, /<Text dimColor=\{!isActiveGroup\} wrap="truncate-end">/)
  assert.match(source, /<Box flexDirection="row" width="100%">/)
})

test('Assistant tool-use rows keep a full-width content column', () => {
  const source = readSource('src/components/messages/AssistantToolUseMessage.tsx')

  assert.match(
    source,
    /<Box flexDirection="row" flexWrap="nowrap" minWidth=\{t6\} flexGrow=\{1\} flexShrink=\{1\}>/,
  )
  assert.match(
    source,
    /<Box flexDirection="column" width="100%">\{t12\}\{t13\}\{t14\}<\/Box>/,
  )
  assert.match(
    source,
    /<Box flexDirection="row" marginTop=\{t5\} width="100%" backgroundColor=\{bg\}><Box flexGrow=\{1\} flexShrink=\{1\} minWidth=\{0\}>\{t15\}<\/Box><\/Box>/,
  )
})

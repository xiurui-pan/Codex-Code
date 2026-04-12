import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

function readSource(path) {
  return readFileSync(join(projectRoot, path), 'utf8')
}

test('Prompt input footer constrains right-side status area to a shrinkable column', () => {
  const source = readSource('src/components/PromptInput/PromptInputFooter.tsx')

  assert.match(source, /<Box flexShrink=\{1\} minWidth=\{0\} gap=\{1\}>/)
  assert.match(source, /<Box flexShrink=\{1\} minWidth=\{0\}><Notifications /)
  assert.match(source, /<Box flexShrink=\{1\} minWidth=\{0\}><BridgeStatusIndicator bridgeSelected=\{bridgeSelected\} \/><\/Box>/)
})

test('Notifications root stays shrinkable so long status text truncates in-place', () => {
  const source = readSource('src/components/PromptInput/Notifications.tsx')

  assert.match(source, /<Box flexDirection="column" alignItems=\{t11\} flexShrink=\{1\} minWidth=\{0\} overflowX="hidden">\{t13\}<\/Box>/)
  assert.match(source, /<IdeStatusIndicator ideSelection=\{ideSelection\} mcpClients=\{mcpClients\} \/>/)
  assert.match(source, /wrap="truncate"/)
})

test('IDE status indicator uses a shrinkable wrapper for long file and selection labels', () => {
  const source = readSource('src/components/IdeStatusIndicator.tsx')

  assert.match(source, /import \{ Box, Text \} from '\.\.\/ink\.js';/)
  assert.match(source, /<Box flexShrink=\{1\} minWidth=\{0\}><Text color="ide" key="selection-indicator" wrap="truncate">⧉ \{ideSelection\.lineCount\}/)
  assert.match(source, /<Box flexShrink=\{1\} minWidth=\{0\}><Text color="ide" key="selection-indicator" wrap="truncate">⧉ In \{t1\}<\/Text><\/Box>/)
})

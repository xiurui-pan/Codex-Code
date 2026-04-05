import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function readSource(path) {
  return readFileSync(join('/home/pxr/workspace/CodingAgent/Codex-Code/upstream/claude-code', path), 'utf8')
}

test('/context headline uses the shared display token count helper', () => {
  const source = readSource('src/utils/analyzeContext.ts')

  assert.match(source, /getDisplayContextTokenCount/)
  assert.match(source, /totalFromDisplayUsage > 0 \? totalFromDisplayUsage : totalIncludingReserved/)
})

test('/context detail sections filter out zero-token MCP and memory rows', () => {
  const interactive = readSource('src/components/ContextVisualization.tsx')
  const noninteractive = readSource('src/commands/context/context-noninteractive.ts')

  assert.match(interactive, /visibleMemoryFiles = memoryFiles\.filter/)
  assert.match(interactive, /loadedMcpTools = mcpTools\.filter/)
  assert.match(noninteractive, /visibleMemoryFiles = memoryFiles\.filter\(file => file\.tokens > 0\)/)
  assert.match(noninteractive, /visibleMcpTools = mcpTools\.filter\(tool => tool\.tokens > 0\)/)
})

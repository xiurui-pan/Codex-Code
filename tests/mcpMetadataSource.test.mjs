import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { projectRoot } from './helpers/projectRoot.mjs'
import { join } from 'node:path'

async function readSource(relativePath) {
  return readFile(join(projectRoot, relativePath), 'utf8')
}

test('MCP metadata uses provider-neutral keys for eager tool loading hints', async () => {
  const mcpClientSource = await readSource('src/services/mcp/client.ts')
  const toolSource = await readSource('src/Tool.ts')
  const toolSearchPrompt = await readSource('src/tools/ToolSearchTool/prompt.ts')

  assert.match(mcpClientSource, /tool\._meta\?\.searchHint/)
  assert.match(mcpClientSource, /tool\._meta\?\.alwaysLoad === true/)
  assert.doesNotMatch(mcpClientSource, /anthropic\/searchHint/)
  assert.doesNotMatch(mcpClientSource, /anthropic\/alwaysLoad/)

  assert.doesNotMatch(toolSource, /anthropic\/alwaysLoad/)
  assert.doesNotMatch(toolSearchPrompt, /anthropic\/alwaysLoad/)
  assert.match(toolSearchPrompt, /_meta\.alwaysLoad/)
})


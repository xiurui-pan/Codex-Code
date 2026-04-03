import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const SOURCE_PATH =
  '/home/pxr/workspace/CodingAgent/Codex-Code/upstream/claude-code/src/utils/codexConfig.ts'

test('codex config parser reads web_search mode and tool settings from config.toml', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8')

  assert.match(source, /currentSection === 'tools\.web_search'/)
  assert.match(source, /key === 'web_search'/)
  assert.match(source, /key === 'context_size'/)
  assert.match(source, /key === 'allowed_domains'/)
  assert.match(source, /key === 'location'/)
})

test('codex config exports native web search env helpers', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8')

  assert.match(source, /CLAUDE_CODE_CODEX_WEB_SEARCH_MODE/)
  assert.match(source, /CLAUDE_CODE_CODEX_WEB_SEARCH_ALLOWED_DOMAINS/)
  assert.match(source, /CLAUDE_CODE_CODEX_WEB_SEARCH_CONTEXT_SIZE/)
  assert.match(source, /CLAUDE_CODE_CODEX_WEB_SEARCH_LOCATION/)
  assert.match(source, /export function getCodexConfiguredWebSearchMode/)
})

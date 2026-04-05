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

  assert.match(source, /CODEX_CODE_WEB_SEARCH_MODE/)
  assert.match(source, /CODEX_CODE_WEB_SEARCH_ALLOWED_DOMAINS/)
  assert.match(source, /CODEX_CODE_WEB_SEARCH_CONTEXT_SIZE/)
  assert.match(source, /CODEX_CODE_WEB_SEARCH_LOCATION/)
  assert.match(source, /export function getCodexConfiguredWebSearchMode/)
})

test('codex config exposes context window and auto compact helpers', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8')

  assert.match(source, /CODEX_DEFAULT_CONTEXT_WINDOW = 272_000/)
  assert.match(source, /CODEX_EFFECTIVE_CONTEXT_WINDOW_PERCENT = 95/)
  assert.match(source, /key === 'model_context_window'/)
  assert.match(source, /key === 'model_auto_compact_token_limit'/)
  assert.match(source, /CODEX_CODE_MODEL_CONTEXT_WINDOW/)
  assert.match(source, /CODEX_CODE_MODEL_AUTO_COMPACT_TOKEN_LIMIT/)
  assert.match(source, /export function getCodexEffectiveContextWindow/)
  assert.match(source, /export function getCodexAutoCompactTokenLimit/)
})

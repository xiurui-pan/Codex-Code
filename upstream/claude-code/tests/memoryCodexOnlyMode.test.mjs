import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const PATHS_SOURCE_PATH =
  '/home/pxr/workspace/CodingAgent/Codex-Code/upstream/claude-code/src/memdir/paths.ts'

test('codex-only memory mode is evaluated dynamically from env', async () => {
  const source = await readFile(PATHS_SOURCE_PATH, 'utf8')

  assert.match(source, /function isCodexOnlyMemoryMode\(\): boolean/)
  assert.match(
    source,
    /return process\.env\.CLAUDE_CODE_USE_CODEX_PROVIDER === '1'/,
  )
  assert.doesNotMatch(
    source,
    /const currentStageDisableBroadAutoMemory\s*=/,
  )
})

test('broad auto-memory gating uses codex-only mode helper at call time', async () => {
  const source = await readFile(PATHS_SOURCE_PATH, 'utf8')
  assert.match(source, /if \(isCodexOnlyMemoryMode\(\)\) \{/)
})

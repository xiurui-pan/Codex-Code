import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { projectRoot } from './helpers/projectRoot.mjs'
import { join } from 'node:path'

const PATHS_SOURCE_PATH = join(projectRoot, 'src/memdir/paths.ts')
const TEAM_MEM_SOURCE_PATH = join(projectRoot, 'src/memdir/teamMemPaths.ts')

test('codex-only memory mode is evaluated dynamically from env', async () => {
  const source = await readFile(PATHS_SOURCE_PATH, 'utf8')

  assert.match(source, /function isCodexOnlyMemoryMode\(\): boolean/)
  assert.match(
    source,
    /return process\.env\.CODEX_CODE_USE_CODEX_PROVIDER === '1'/,
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

test('team memory is disabled entirely in codex mode', async () => {
  const source = await readFile(TEAM_MEM_SOURCE_PATH, 'utf8')

  assert.match(
    source,
    /if \(!isAutoMemoryEnabled\(\) \|\| isCurrentPhaseCustomCodexProvider\(\)\) \{\s*return false/s,
  )
})

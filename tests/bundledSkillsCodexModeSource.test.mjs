import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { projectRoot } from './helpers/projectRoot.mjs'
import { join } from 'node:path'

test('codex mode skips Claude-only bundled skills at registration time', async () => {
  const source = await readFile(
    join(projectRoot, 'src/skills/bundled/index.ts'),
    'utf8',
  )

  assert.match(source, /const currentPhaseCustomCodexProvider = isCurrentPhaseCustomCodexProvider\(\)/)
  assert.match(source, /!currentPhaseCustomCodexProvider && feature\('BUILDING_CLAUDE_APPS'\)/)
  assert.match(source, /!currentPhaseCustomCodexProvider && shouldAutoEnableClaudeInChrome\(\)/)
})


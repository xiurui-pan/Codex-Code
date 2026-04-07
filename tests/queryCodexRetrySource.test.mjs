import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

test('query surfaces Codex reconnect progress messages to the UI', () => {
  const source = readFileSync(join(projectRoot, 'src/query.ts'), 'utf8')

  assert.match(source, /kind === 'retry'/)
  assert.match(source, /createSystemMessage\(retryChunk\.message, 'info'\)/)
})

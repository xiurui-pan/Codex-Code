import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

function readSource(path: string): string {
  return readFileSync(join(projectRoot, path), 'utf8')
}

test('side-question message sanitization trims in-progress assistant tails from nearest trailing assistant', () => {
  const source = readSource('src/utils/queryContext.ts')

  assert.match(source, /export function stripInProgressAssistantTurn\(messages: Message\[\]\): Message\[\]/)
  assert.match(source, /for \(let i = messages\.length - 1; i >= 0; i -= 1\)/)
  assert.match(source, /message\.message\.stop_reason === null/)
  assert.match(source, /return messages\.slice\(0, i\)/)
})

test('btw and sdk fallback both reuse the shared in-progress stripping helper', () => {
  const btwSource = readSource('src/commands/btw/btw.tsx')
  const queryContextSource = readSource('src/utils/queryContext.ts')

  assert.match(btwSource, /stripInProgressAssistantTurn\(context\.messages\)/)
  assert.match(queryContextSource, /const forkContextMessages = stripInProgressAssistantTurn\(messages\)/)
})

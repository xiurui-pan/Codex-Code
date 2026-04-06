import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { getEmptyToolPermissionContext } from '../src/Tool.js'
import { generateSuggestions } from '../src/utils/permissions/filesystem.js'

function makePlanContext() {
  return {
    ...getEmptyToolPermissionContext(),
    mode: 'plan' as const,
    isBypassPermissionsModeAvailable: true,
  }
}

test('read suggestions inside the working directory do not switch plan mode to acceptEdits', () => {
  const suggestions = generateSuggestions(
    join(process.cwd(), 'README.md'),
    'read',
    makePlanContext(),
  )

  assert.deepEqual(suggestions, [])
})

test('read suggestions outside the working directory still offer read access instead of acceptEdits', () => {
  const suggestions = generateSuggestions(
    join(tmpdir(), 'codex-read-suggestion-target.txt'),
    'read',
    makePlanContext(),
  )

  assert.ok(suggestions.length > 0)
  assert.ok(suggestions.every(update => update.type !== 'setMode'))
  assert.ok(suggestions.some(update => update.type === 'addRules'))
})

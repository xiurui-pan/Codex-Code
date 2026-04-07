import assert from 'node:assert/strict'
import test from 'node:test'

import { getCompactDisplayHint } from '../src/commands/compact/compact.js'

test('compact display hint only mentions full summary when a readable summary exists', () => {
  assert.equal(
    getCompactDisplayHint(false, true, 'ctrl+o'),
    '(ctrl+o to see full summary)',
  )
  assert.equal(getCompactDisplayHint(false, false, 'ctrl+o'), null)
  assert.equal(getCompactDisplayHint(true, true, 'ctrl+o'), null)
})

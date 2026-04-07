import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeStatusLineOutput } from '../src/utils/hooks.js'

test('normalizeStatusLineOutput collapses multi-line output into one clean line', () => {
  const output = normalizeStatusLineOutput(
    '  first line\r\n\x07second line\n\n third line \u001b[32mok\u001b[0m  ',
  )

  assert.equal(output, 'first line · second line · third line \u001b[32mok\u001b[0m')
})

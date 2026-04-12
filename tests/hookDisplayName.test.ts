import assert from 'node:assert/strict'
import test from 'node:test'

import { formatHookNameForDisplay } from '../src/utils/hooks/displayName.js'

test('formatHookNameForDisplay renders event qualifiers without raw colons', () => {
  assert.equal(formatHookNameForDisplay('SessionStart:startup'), 'SessionStart (startup)')
  assert.equal(formatHookNameForDisplay('PreToolUse:Bash'), 'PreToolUse (Bash)')
  assert.equal(formatHookNameForDisplay('Stop'), 'Stop')
})

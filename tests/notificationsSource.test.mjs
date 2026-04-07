import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

const notificationsSource = readFileSync(
  join(projectRoot, 'src/components/PromptInput/Notifications.tsx'),
  'utf8',
)

test('Notifications warning uses shared current-context token counting', () => {
  assert.match(notificationsSource, /getDisplayContextTokenCount/)
  assert.match(
    notificationsSource,
    /getDisplayContextTokenCount\(messagesForTokenCount, \{\s*includeRestoredTotals: false/s,
  )
  assert.doesNotMatch(notificationsSource, /tokenCountFromLastAPIResponse/)
})

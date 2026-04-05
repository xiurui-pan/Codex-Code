import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

function readSource(path) {
  return readFileSync(join(projectRoot, path), 'utf8')
}

test('user text message forwards transcript mode into task notifications', () => {
  const source = readSource('src/components/messages/UserTextMessage.tsx')

  assert.match(
    source,
    /<UserAgentNotificationMessage addMargin=\{addMargin\} param=\{param\} isTranscriptMode=\{isTranscriptMode\} \/>/,
  )
})

test('async agent detail dialog renders the completed response block', () => {
  const source = readSource('src/components/tasks/AsyncAgentDetailDialog.tsx')

  assert.match(source, /agent\.status === 'completed'/)
  assert.match(source, /agent\.result\?\.content/)
  assert.match(source, /Response/)
})

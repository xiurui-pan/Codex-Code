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

test('transcript mode uses fresh messages after the turn ends', () => {
  const source = readSource('src/screens/REPL.tsx')

  assert.match(
    source,
    /const transcriptMessageSource = usesSyncMessages \? messages : deferredMessages;/,
  )
  assert.match(
    source,
    /const transcriptBaseMessages = frozenTranscriptState \? transcriptMessageSource\.slice\(0, frozenTranscriptState\.messagesLength\) : transcriptMessageSource;/,
  )
})

test('main message list receives streaming thinking state too', () => {
  const source = readSource('src/screens/REPL.tsx')

  assert.match(
    source,
    /streamingThinking=\{viewedAgentTask \? null : streamingThinking\}/,
  )
})

test('transcript mode keeps all completed thinking blocks instead of hiding past turns', () => {
  const source = readSource('src/screens/REPL.tsx')

  assert.match(source, /hidePastThinking=\{false\}/)
})

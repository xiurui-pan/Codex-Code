import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  createAssistantMessageFromPreferredAssistantResponsePayload,
} from '../src/services/api/assistantEnvelope.js'
import { preferredTurnResultToPayload } from '../src/services/api/preferredAssistantResponse.js'

async function readModelSource(): Promise<string> {
  const modelPath = fileURLToPath(
    new URL('../src/services/api/model.ts', import.meta.url),
  )
  return readFile(modelPath, 'utf8')
}

async function readCodexResponsesSource(): Promise<string> {
  const sourcePath = fileURLToPath(
    new URL('../src/services/api/codexResponses.ts', import.meta.url),
  )
  return readFile(sourcePath, 'utf8')
}

test('model entry no longer imports claude facade or ANTHROPIC_MODEL', async () => {
  const source = await readModelSource()

  assert.equal(source.includes("'./claude.js'"), false)
  assert.equal(source.includes('ANTHROPIC_MODEL'), false)
})

test('preferred response conversion keeps payload first and only wraps at the outer assistant edge', () => {
  const payload = preferredTurnResultToPayload({
    kind: 'preferred_content',
    preferred: {
      kind: 'text',
      text: 'payload text',
      renderableItems: [
        {
          kind: 'final_answer',
          provider: 'custom',
          text: 'payload text',
          source: 'message_output',
        },
      ],
    },
  })

  assert.equal(payload.kind, 'synthetic_payload')
  assert.equal(payload.payload.content[0]?.type, 'text')
  assert.equal(payload.payload.content[0]?.text, 'payload text')
  assert.equal('message' in payload, false)

  const assistantMessage =
    createAssistantMessageFromPreferredAssistantResponsePayload(payload)
  assert.equal(assistantMessage.message.content[0]?.type, 'text')
  assert.equal(assistantMessage.message.content[0]?.text, 'payload text')
})

test('preferred response conversion keeps api_error on the payload side until wrapping', () => {
  const payload = preferredTurnResultToPayload({
    kind: 'api_error',
    errorMessage: 'boom',
  })

  assert.deepEqual(payload, {
    kind: 'api_error',
    errorMessage: 'boom',
  })

  const assistantMessage =
    createAssistantMessageFromPreferredAssistantResponsePayload(payload)
  assert.equal(assistantMessage.isApiErrorMessage, true)
  assert.equal(assistantMessage.message.content[0]?.type, 'text')
  assert.equal(assistantMessage.message.content[0]?.text, 'boom')
})

test('codex responses entry now returns raw turn-item chunks and leaves assistant-shell compatibility to outer layers', async () => {
  const source = await readCodexResponsesSource()

  assert.equal(source.includes("kind: 'turn_items'"), true)
  assert.equal(source.includes('mergeStreamedAssistantMessages'), false)
  assert.equal(source.includes('codex-synthetic'), false)
})

import test from 'node:test'
import assert from 'node:assert/strict'

import { extractFinalAnswerTextFromTurnItems } from '../src/services/api/modelTurnItems.js'

test('extractFinalAnswerTextFromTurnItems joins multiple final answers in order', () => {
  const text = extractFinalAnswerTextFromTurnItems([
    {
      kind: 'ui_message',
      provider: 'custom',
      level: 'info',
      text: 'skip me',
      source: 'test',
    },
    {
      kind: 'final_answer',
      provider: 'custom',
      text: ' first answer ',
      source: 'message_output',
    },
    {
      kind: 'final_answer',
      provider: 'custom',
      text: 'second answer',
      source: 'message_output',
    },
  ])

  assert.equal(text, 'first answer\nsecond answer')
})

test('extractFinalAnswerTextFromTurnItems drops blank final answers', () => {
  const text = extractFinalAnswerTextFromTurnItems(
    [
      {
        kind: 'final_answer',
        provider: 'custom',
        text: '   ',
        source: 'message_output',
      },
      {
        kind: 'final_answer',
        provider: 'custom',
        text: '\nuseful text\n',
        source: 'message_output',
      },
    ],
    '',
  )

  assert.equal(text, 'useful text')
})

test('extractFinalAnswerTextFromTurnItems returns empty string when nothing renderable exists', () => {
  const text = extractFinalAnswerTextFromTurnItems([
    {
      kind: 'tool_output',
      provider: 'custom',
      toolUseId: 'tool-1',
      outputText: 'pwd',
      source: 'tool_execution',
    },
  ])

  assert.equal(text, '')
})

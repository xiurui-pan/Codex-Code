import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getCompactPrompt,
  getPartialCompactPrompt,
} from '../src/services/compact/prompt.js'

test('full compact prompt stays focused and avoids bulky examples', () => {
  const prompt = getCompactPrompt()

  assert.ok(prompt.length < 2800, `expected compact prompt < 2800 chars, got ${prompt.length}`)
  assert.doesNotMatch(prompt, /<example>/)
  assert.doesNotMatch(prompt, /full code snippets/i)
  assert.match(prompt, /User requests and constraints/)
  assert.match(prompt, /User feedback that changed direction/)
  assert.match(prompt, /Current state and exact next step/)
})

test('partial compact prompt stays focused and keeps recent-only guidance', () => {
  const prompt = getPartialCompactPrompt()

  assert.ok(prompt.length < 2800, `expected partial prompt < 2800 chars, got ${prompt.length}`)
  assert.match(prompt, /recent portion of the conversation/i)
  assert.doesNotMatch(prompt, /<example>/)
  assert.match(prompt, /Cover only the recent messages/)
  assert.match(prompt, /Pending work, open questions, and risks/)
})

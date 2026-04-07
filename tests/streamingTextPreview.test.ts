import test from 'node:test'
import assert from 'node:assert/strict'
import { getVisibleStreamingText } from '../src/utils/streamingText.js'

test('streaming preview stays hidden when disabled or empty', () => {
  assert.equal(getVisibleStreamingText(null, true), null)
  assert.equal(getVisibleStreamingText('checking config', false), null)
  assert.equal(getVisibleStreamingText('short', true), null)
})

test('streaming preview keeps completed lines immediately', () => {
  assert.equal(
    getVisibleStreamingText('Found the route.\nStill reading', true),
    'Found the route.\n',
  )
})

test('streaming preview reveals single-line commentary at stable word boundaries', () => {
  assert.equal(
    getVisibleStreamingText('I will inspect the config path next', true),
    'I will inspect the config path',
  )
})

test('streaming preview reveals non-whitespace text in small chunks', () => {
  assert.equal(
    getVisibleStreamingText('继续检查压缩链路中', true),
    '继续检查压缩链路',
  )
})

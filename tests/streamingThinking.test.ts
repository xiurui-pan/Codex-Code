import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STREAMING_THINKING_RETENTION_MS,
  getStreamingThinkingHideDelay,
  isStreamingThinkingVisible,
} from '../src/utils/streamingThinking.js'

test('streaming thinking stays visible while it is still streaming', () => {
  assert.equal(
    isStreamingThinkingVisible({
      thinking: 'Checking files',
      isStreaming: true,
    }),
    true,
  )
})

test('completed streaming thinking stays visible during the grace window', () => {
  const now = 50_000
  const streamingThinking = {
    thinking: 'Checking files',
    isStreaming: false,
    streamingEndedAt: now - 1_500,
  }

  assert.equal(isStreamingThinkingVisible(streamingThinking, now), true)
  assert.equal(
    getStreamingThinkingHideDelay(streamingThinking, now),
    STREAMING_THINKING_RETENTION_MS - 1_500,
  )
})

test('completed streaming thinking hides after the grace window elapses', () => {
  const now = 50_000
  const streamingThinking = {
    thinking: 'Checking files',
    isStreaming: false,
    streamingEndedAt: now - STREAMING_THINKING_RETENTION_MS - 1,
  }

  assert.equal(isStreamingThinkingVisible(streamingThinking, now), false)
  assert.equal(getStreamingThinkingHideDelay(streamingThinking, now), 0)
})

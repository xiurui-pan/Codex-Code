import assert from 'node:assert/strict'
import test from 'node:test'

import { getFallbackToolUseErrorDisplay } from '../src/components/FallbackToolUseErrorMessage.js'

test('fallback tool error summary keeps both the head and tail of long failures', () => {
  const result = Array.from({ length: 14 }, (_, index) => `line-${index + 1}`).join(
    '\n',
  )

  const summary = getFallbackToolUseErrorDisplay(result, {
    verbose: false,
    maxRenderedLines: 6,
  })

  assert.match(summary.display, /Error: line-1/)
  assert.match(summary.display, /line-14/)
  assert.match(summary.display, /…/)
  assert.equal(summary.omittedLines, 9)
})

test('fallback tool error display shows the full error in transcript mode', () => {
  const result = Array.from({ length: 12 }, (_, index) => `line-${index + 1}`).join(
    '\n',
  )

  const summary = getFallbackToolUseErrorDisplay(result, {
    verbose: false,
    isTranscriptMode: true,
  })

  assert.doesNotMatch(summary.display, /…/)
  assert.match(summary.display, /line-12/)
  assert.equal(summary.omittedLines, 0)
})

test('fallback tool error display preserves text from structured non-string payloads', () => {
  const summary = getFallbackToolUseErrorDisplay(
    [
      {
        type: 'text',
        text: '<tool_use_error>structured boom</tool_use_error>',
      },
    ] as never,
    {
      verbose: false,
    },
  )

  assert.match(summary.display, /structured boom/)
  assert.equal(summary.omittedLines, 0)
})

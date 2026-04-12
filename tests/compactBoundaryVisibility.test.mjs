import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { Message } from '../src/components/Message.js'
import { renderToString } from '../src/utils/staticRender.js'
import {
  buildMessageLookups,
  createCompactBoundaryMessage,
} from '../src/utils/messages.js'

async function renderCompactBoundaryInFullscreen() {
  const prev = process.env.CODEX_CODE_NO_FLICKER
  process.env.CODEX_CODE_NO_FLICKER = '1'

  try {
    const message = createCompactBoundaryMessage('auto', 123_456)
    const lookups = buildMessageLookups([message], [message])

    return await renderToString(
      React.createElement(Message, {
        message,
        lookups,
        addMargin: false,
        tools: [],
        commands: [],
        verbose: false,
        inProgressToolUseIDs: new Set(),
        progressMessagesForMessage: [],
        shouldAnimate: false,
        shouldShowDot: false,
        isTranscriptMode: false,
        isStatic: true,
      }),
      120,
    )
  } finally {
    if (prev === undefined) {
      delete process.env.CODEX_CODE_NO_FLICKER
    } else {
      process.env.CODEX_CODE_NO_FLICKER = prev
    }
  }
}

test('fullscreen prompt still shows the compact boundary banner', async () => {
  const output = await renderCompactBoundaryInFullscreen()

  assert.match(output, /Conversation compacted/)
})

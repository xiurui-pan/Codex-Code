import test from 'node:test'
import assert from 'node:assert/strict'
import { handleMessageFromStream } from '../src/utils/messages.js'

test('stream_request_start clears partial stream state before a retry resumes', () => {
  let streamingText: string | null = 'partial text'
  let streamingToolUses = [
    {
      index: 0,
      contentBlock: {
        type: 'tool_use' as const,
        id: 'tool-1',
        name: 'Bash',
        input: {},
      },
      unparsedToolInput: '{"command":"pwd"}',
    },
  ]
  let streamingThinking: {
    thinking: string
    isStreaming: boolean
    streamingEndedAt?: number
  } | null = {
    thinking: 'partial thinking',
    isStreaming: true,
  }
  let mode: string | null = null

  handleMessageFromStream(
    { type: 'stream_request_start' },
    () => {},
    () => {},
    nextMode => {
      mode = nextMode
    },
    updater => {
      streamingToolUses = updater(streamingToolUses)
    },
    undefined,
    updater => {
      streamingThinking = updater(streamingThinking)
    },
    undefined,
    updater => {
      streamingText = updater(streamingText)
    },
  )

  assert.equal(mode, 'requesting')
  assert.equal(streamingText, null)
  assert.deepEqual(streamingToolUses, [])
  assert.equal(streamingThinking, null)
})

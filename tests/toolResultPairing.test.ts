import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SYNTHETIC_TOOL_RESULT_PLACEHOLDER,
  createAssistantMessage,
  createUserMessage,
  ensureToolResultPairing,
} from '../src/utils/messages.js'
import { enableConfigs } from '../src/utils/config.ts'

enableConfigs()

function toolUseMessage(id: string, name = 'Agent') {
  return createAssistantMessage({
    content: [
      {
        type: 'tool_use',
        id,
        name,
        input: {},
      } as any,
    ],
  })
}

function toolResultMessage(id: string, isError = false) {
  return createUserMessage({
    content: [
      {
        type: 'tool_result',
        tool_use_id: id,
        content: isError
          ? '[Request interrupted by user for tool use]'
          : `result:${id}`,
        is_error: isError,
      },
    ],
  })
}

test('ensureToolResultPairing keeps batched parallel tool results without injecting synthetic internal errors', () => {
  const messages = [
    createUserMessage({ content: 'investigate drift' }),
    toolUseMessage('call_a', 'Bash'),
    toolUseMessage('call_b'),
    toolUseMessage('call_c'),
    toolResultMessage('call_a'),
    toolResultMessage('call_c'),
    toolResultMessage('call_b'),
  ]

  const repaired = ensureToolResultPairing(messages)
  const repairedText = JSON.stringify(repaired)

  assert.equal(
    repairedText.includes(SYNTHETIC_TOOL_RESULT_PLACEHOLDER),
    false,
  )
  assert.equal(repaired.length, messages.length)
  assert.equal(
    repaired.filter(
      msg =>
        msg.type === 'user' &&
        Array.isArray(msg.message.content) &&
        msg.message.content[0]?.type === 'tool_result',
    ).length,
    3,
  )
})

test('ensureToolResultPairing injects only the truly missing tool result once per assistant batch', () => {
  const messages = [
    createUserMessage({ content: 'continue' }),
    toolUseMessage('call_a'),
    toolUseMessage('call_b'),
    toolUseMessage('call_c'),
    toolResultMessage('call_b'),
    toolResultMessage('call_c', true),
  ]

  const repaired = ensureToolResultPairing(messages)
  const syntheticResults = repaired.filter(
    msg =>
      msg.type === 'user' &&
      Array.isArray(msg.message.content) &&
      msg.message.content.some(
        block =>
          block.type === 'tool_result' &&
          block.content === SYNTHETIC_TOOL_RESULT_PLACEHOLDER,
      ),
  )

  assert.equal(syntheticResults.length, 1)
  const firstResultMessage = syntheticResults[0]
  assert.ok(firstResultMessage)
  assert.equal(firstResultMessage.type, 'user')
  if (firstResultMessage.type === 'user') {
    const toolResults = firstResultMessage.message.content.filter(
      (block): block is Extract<(typeof firstResultMessage.message.content)[number], { type: 'tool_result' }> =>
        block.type === 'tool_result',
    )
    assert.equal(toolResults[0]?.tool_use_id, 'call_a')
    assert.equal(
      toolResults.filter(
        block => block.content === SYNTHETIC_TOOL_RESULT_PLACEHOLDER,
      ).length,
      1,
    )
    assert.equal(
      toolResults.some(block => block.tool_use_id === 'call_b'),
      true,
    )
  }
})

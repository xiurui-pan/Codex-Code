import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resetLastMemoryMessageUuid,
  shouldExtractMemory,
} from '../src/services/SessionMemory/sessionMemory.js'
import {
  resetSessionMemoryState,
  setSessionMemoryConfig,
} from '../src/services/SessionMemory/sessionMemoryUtils.js'
import {
  createAssistantMessage,
  createUserMessage,
} from '../src/utils/messages.js'
import { BASH_TOOL_NAME } from '../src/tools/BashTool/toolName.js'

function createToolUseAssistantMessage() {
  return createAssistantMessage({
    content: [
      {
        type: 'tool_use',
        id: 'tool-1',
        name: BASH_TOOL_NAME,
        input: { command: 'pwd' },
      },
    ],
  })
}

test('session memory does not extract while the latest assistant turn still has tool calls', () => {
  resetSessionMemoryState()
  resetLastMemoryMessageUuid()
  setSessionMemoryConfig({
    minimumMessageTokensToInit: 1,
    minimumTokensBetweenUpdate: 1,
    toolCallsBetweenUpdates: 1,
  })

  const messages = [
    createUserMessage({
      content:
        '请检查这个仓库里和 session memory 相关的实现差异，并直接告诉我结论。',
    }),
    createToolUseAssistantMessage(),
  ]

  assert.equal(shouldExtractMemory(messages), false)

  resetSessionMemoryState()
  resetLastMemoryMessageUuid()
})

test('session memory can still extract again after the turn settles', () => {
  resetSessionMemoryState()
  resetLastMemoryMessageUuid()
  setSessionMemoryConfig({
    minimumMessageTokensToInit: 1,
    minimumTokensBetweenUpdate: 1,
    toolCallsBetweenUpdates: 1,
  })

  const messages = [
    createUserMessage({
      content:
        '请检查这个仓库里和 session memory 相关的实现差异，并直接告诉我结论。',
    }),
    createAssistantMessage({
      content: '我已经整理完了，接下来给你结论。',
    }),
  ]

  assert.equal(shouldExtractMemory(messages), true)

  resetSessionMemoryState()
  resetLastMemoryMessageUuid()
})

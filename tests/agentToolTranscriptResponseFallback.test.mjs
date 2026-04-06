import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { UserToolResultMessage } from '../src/components/messages/UserToolResultMessage/UserToolResultMessage.js'
import { AgentTool } from '../src/tools/AgentTool/AgentTool.js'
import { renderToolResultMessage } from '../src/tools/AgentTool/UI.js'
import { shouldRenderToolResultMessage } from '../src/components/Messages.js'
import { renderToString } from '../src/utils/staticRender.js'
import {
  buildMessageLookups,
  createAssistantMessage,
  createUserMessage,
  getProgressMessagesFromLookup,
  isNotEmptyMessage,
  normalizeMessages,
} from '../src/utils/messages.js'

function renderAgentResult(result, progressMessages, options) {
  return renderToString(
    React.createElement(
      React.Fragment,
      null,
      renderToolResultMessage(result, progressMessages, options),
    ),
    120,
  )
}

function renderPersistedAgentToolResult(toolUseResult) {
  const toolUseId = 'persisted-agent-tool-use'
  const normalizedMessages = normalizeMessages([
    createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: 'Agent',
          input: {
            description: '测试子代理运行',
            prompt:
              '这是一次子代理调用测试。请只返回一句确认你已正常启动的简短中文。',
            subagent_type: 'general-purpose',
            model: 'haiku',
          },
        },
      ],
    }),
    createUserMessage({
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: [
            {
              type: 'text',
              text: '已启动，运行正常。当前任务：仅做状态确认，不改文件不执行副作用命令。',
            },
            {
              type: 'text',
              text: "agentId: persisted-agent (use SendMessage with to: 'persisted-agent' to continue this agent)",
            },
          ],
        },
      ],
      toolUseResult,
    }),
  ]).filter(isNotEmptyMessage)

  const userToolResultMessage = normalizedMessages.find(
    message =>
      message.type === 'user' && message.message.content[0]?.type === 'tool_result',
  )

  assert.ok(userToolResultMessage && userToolResultMessage.type === 'user')

  const lookups = buildMessageLookups(normalizedMessages, normalizedMessages)

  return renderToString(
    React.createElement(UserToolResultMessage, {
      param: userToolResultMessage.message.content[0],
      message: userToolResultMessage,
      lookups,
      progressMessagesForMessage: getProgressMessagesFromLookup(
        userToolResultMessage,
        lookups,
      ),
      tools: [AgentTool],
      verbose: true,
      width: 120,
      isTranscriptMode: true,
    }),
    120,
  )
}

function createUsage() {
  return {
    input_tokens: 5,
    output_tokens: 7,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    server_tool_use: null,
    service_tier: null,
    cache_creation: null,
  }
}

test(
  'agent transcript falls back to progress assistant text when completed content is empty',
  async () => {
    const output = await renderAgentResult(
      {
        status: 'completed',
        agentId: 'agent-fallback',
        agentType: 'general-purpose',
        prompt: 'Test agent call',
        content: [],
        totalToolUseCount: 1,
        totalDurationMs: 10,
        totalTokens: 12,
        usage: createUsage(),
      },
      [
        {
          type: 'progress',
          uuid: 'progress-1',
          parentUuid: 'root',
          timestamp: Date.now(),
          level: 'info',
          data: {
            agentId: 'agent-fallback',
            prompt: 'Test agent call',
            message: {
              type: 'assistant',
              message: {
                id: 'assistant-progress-1',
                type: 'message',
                role: 'assistant',
                model: 'gpt-5',
                usage: createUsage(),
                content: [
                  { type: 'text', text: 'AGENT_PROGRESS_FALLBACK_OK' },
                ],
              },
            },
          },
        },
      ],
      {
        tools: [],
        verbose: false,
        theme: 'dark',
        isTranscriptMode: true,
      },
    )

    assert.match(output, /Response:/)
    assert.match(output, /AGENT_PROGRESS_FALLBACK_OK/)
  },
)

test('agent card keeps only the done summary visible before entering transcript mode', async () => {
  const output = await renderAgentResult(
    {
      status: 'completed',
      agentId: 'agent-card',
      agentType: 'general-purpose',
      prompt: 'Test normal agent card',
      content: [{ type: 'text', text: 'AGENT_CARD_FINAL_OK' }],
      totalToolUseCount: 1,
      totalDurationMs: 10,
      totalTokens: 12,
      usage: createUsage(),
    },
    [],
    {
      tools: [],
      verbose: false,
      theme: 'dark',
      isTranscriptMode: false,
    },
  )

  assert.match(output, /Done/)
  assert.doesNotMatch(output, /Response:/)
  assert.doesNotMatch(output, /AGENT_CARD_FINAL_OK/)
})

test('agent transcript keeps intermediate assistant commentary visible', async () => {
  const output = await renderAgentResult(
    {
      status: 'completed',
      agentId: 'agent-commentary',
      agentType: 'general-purpose',
      prompt: 'Test commentary visibility',
      content: [{ type: 'text', text: 'AGENT_TRANSCRIPT_FINAL_OK' }],
      totalToolUseCount: 1,
      totalDurationMs: 10,
      totalTokens: 12,
      usage: createUsage(),
    },
    [
      {
        type: 'progress',
        uuid: 'progress-commentary',
        parentUuid: 'root',
        timestamp: Date.now(),
        level: 'info',
        data: {
          agentId: 'agent-commentary',
          prompt: 'Test commentary visibility',
          message: {
            type: 'assistant',
            message: {
              id: 'assistant-commentary-1',
              type: 'message',
              role: 'assistant',
              model: 'gpt-5',
              usage: createUsage(),
              content: [
                {
                  type: 'text',
                  text: 'Intermediate commentary still visible.',
                },
              ],
            },
          },
        },
      },
    ],
    {
      tools: [],
      verbose: false,
      theme: 'dark',
      isTranscriptMode: true,
    },
  )

  assert.match(output, /Intermediate commentary still visible\./)
  assert.match(output, /Response:/)
  assert.match(output, /AGENT_TRANSCRIPT_FINAL_OK/)
})

test(
  'agent transcript still shows persisted replies when optional usage fields are omitted',
  async () => {
    const output = await renderPersistedAgentToolResult({
      status: 'completed',
      agentId: 'persisted-agent',
      agentType: 'general-purpose',
      prompt:
        '这是一次子代理调用测试。请只返回一句确认你已正常启动的简短中文。',
      content: [
        {
          type: 'text',
          text: '已启动，运行正常。当前任务：仅做状态确认，不改文件不执行副作用命令。',
        },
      ],
      totalDurationMs: 6252,
      totalTokens: 14987,
      totalToolUseCount: 0,
      usage: {
        input_tokens: 14932,
        output_tokens: 55,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 14720,
      },
    })

    assert.match(output, /Response:/)
    assert.match(
      output,
      /已启动，运行正常。当前任务：仅做状态确认，不改文件不执行副作用命令。/,
    )
  },
)

test('agent tool_result errors are not filtered out of the message list', () => {
  const toolUseId = 'agent-tool-use-1'
  const normalizedMessages = normalizeMessages([
    createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: 'Agent',
          input: {
            description: 'Show agent error',
            prompt: 'Trigger an agent error',
          },
        },
      ],
    }),
    createUserMessage({
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: 'AGENT_TOOL_ERROR_VISIBLE',
          is_error: true,
        },
      ],
    }),
  ]).filter(isNotEmptyMessage)

  const userMessage = normalizedMessages.find(
    message => message.type === 'user',
  )

  assert.ok(userMessage && userMessage.type === 'user')

  const lookups = buildMessageLookups(normalizedMessages, normalizedMessages)
  assert.equal(
    shouldRenderToolResultMessage(userMessage, lookups, [AgentTool]),
    true,
  )
})

import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { AgentTool } from '../src/tools/AgentTool/AgentTool.js'
import { renderToolResultMessage } from '../src/tools/AgentTool/UI.js'
import { shouldRenderToolResultMessage } from '../src/components/Messages.js'
import { renderToString } from '../src/utils/staticRender.js'
import {
  buildMessageLookups,
  createAssistantMessage,
  createUserMessage,
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

test('agent card keeps the final response visible before entering transcript mode', async () => {
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

  assert.match(output, /Response:/)
  assert.match(output, /AGENT_CARD_FINAL_OK/)
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

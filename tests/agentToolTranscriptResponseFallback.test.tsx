import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import type { ProgressMessage } from '../src/types/message.js'
import type { Progress } from '../src/tools/AgentTool/AgentTool.js'
import { renderToolResultMessage } from '../src/tools/AgentTool/UI.js'
import { renderToString } from '../src/utils/staticRender.js'

test('agent transcript falls back to progress assistant text when completed content is empty', async () => {
  const progressMessages: ProgressMessage<Progress>[] = [
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
            usage: {
              input_tokens: 5,
              output_tokens: 7,
              cache_creation_input_tokens: null,
              cache_read_input_tokens: null,
              server_tool_use: null,
              service_tier: null,
              cache_creation: null,
            },
            content: [{ type: 'text', text: 'AGENT_PROGRESS_FALLBACK_OK' }],
          },
        },
      },
    } as unknown as ProgressMessage<Progress>,
  ]

  const output = await renderToString(
    <>
      {renderToolResultMessage(
        {
          status: 'completed',
          agentId: 'agent-fallback',
          agentType: 'general-purpose',
          prompt: 'Test agent call',
          content: [],
          totalToolUseCount: 1,
          totalDurationMs: 10,
          totalTokens: 12,
          usage: {
            input_tokens: 5,
            output_tokens: 7,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
            server_tool_use: null,
            service_tier: null,
            cache_creation: null,
          },
        },
        progressMessages,
        {
          tools: [],
          verbose: false,
          theme: 'dark',
          isTranscriptMode: true,
        },
      )}
    </>,
    120,
  )

  assert.match(output, /Response:/)
  assert.match(output, /AGENT_PROGRESS_FALLBACK_OK/)
})

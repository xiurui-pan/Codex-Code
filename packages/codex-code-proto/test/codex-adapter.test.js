import test from 'node:test';
import assert from 'node:assert/strict';

import { buildResponsesRequest, runCodexTurn } from '../src/codex-adapter.js';

test('buildResponsesRequest uses responses shape with medium reasoning', () => {
  const body = buildResponsesRequest(
    '只回复 OK',
    {
      model: 'gpt-5.4',
      reasoningEffort: 'medium',
    },
    {
      disableResponseStorage: true,
    },
  );

  assert.deepEqual(body, {
    model: 'gpt-5.4',
    stream: true,
    reasoning: {
      effort: 'medium',
      summary: 'auto',
    },
    input: [
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: '只回复 OK',
          },
        ],
      },
    ],
    store: false,
  });
});

test('runCodexTurn throws when SSE stream reports error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => [
      'event: error',
      'data: {"type":"error","message":"boom"}',
      '',
    ].join('\n'),
  });

  await assert.rejects(
    () => runCodexTurn(
      '只回复 OK',
      { model: 'gpt-5.4', reasoningEffort: 'medium' },
      {
        provider: { wire_api: 'responses', base_url: 'http://localhost:3000/openai' },
      },
    ),
    /responses stream failed: boom/,
  );

  globalThis.fetch = originalFetch;
});

test('runCodexTurn throws when stream has no completed event', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => [
      'event: response.output_item.done',
      'data: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"OK"}]}}',
      '',
    ].join('\n'),
  });

  await assert.rejects(
    () => runCodexTurn(
      '只回复 OK',
      { model: 'gpt-5.4', reasoningEffort: 'medium' },
      {
        provider: { wire_api: 'responses', base_url: 'http://localhost:3000/openai' },
      },
    ),
    /responses stream ended before response.completed/,
  );

  globalThis.fetch = originalFetch;
});

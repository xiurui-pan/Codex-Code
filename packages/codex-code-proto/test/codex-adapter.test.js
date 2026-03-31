import test from 'node:test';
import assert from 'node:assert/strict';

import { buildResponsesRequest } from '../src/codex-adapter.js';

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

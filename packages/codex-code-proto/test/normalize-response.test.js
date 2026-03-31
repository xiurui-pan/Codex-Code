import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeResponseOutput } from '../src/normalize-response.js';

test('normalizeResponseOutput maps reasoning and assistant messages into IR items', () => {
  const items = normalizeResponseOutput({
    output: [
      {
        type: 'reasoning',
        summary: [
          { type: 'summary_text', text: 'step one' },
          { type: 'summary_text', text: 'step two' },
        ],
        content: [
          { type: 'reasoning_text', text: 'raw hidden trace' },
        ],
      },
      {
        type: 'message',
        role: 'assistant',
        phase: 'commentary',
        content: [
          { type: 'output_text', text: 'Working...' },
        ],
      },
      {
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'output_text', text: 'Done.' },
        ],
      },
    ],
  });

  assert.equal(items.length, 3);
  assert.equal(items[0].type, 'reasoning');
  assert.deepEqual(items[0].summaryText, ['step one', 'step two']);
  assert.deepEqual(items[0].rawContent, ['raw hidden trace']);

  assert.equal(items[1].type, 'assistant_message');
  assert.equal(items[1].phase, 'commentary');
  assert.equal(items[1].content[0].text, 'Working...');

  assert.equal(items[2].type, 'assistant_message');
  assert.equal(items[2].phase, 'final');
  assert.equal(items[2].content[0].text, 'Done.');
});

test('normalizeResponseOutput maps function_call into tool_call IR item', () => {
  const items = normalizeResponseOutput({
    output: [
      {
        type: 'function_call',
        name: 'read_file',
        call_id: 'call_123',
        arguments: '{"path":"src/main.js"}',
      },
    ],
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'tool_call');
  assert.equal(items[0].toolName, 'read_file');
  assert.equal(items[0].callId, 'call_123');
  assert.equal(items[0].argumentsText, '{"path":"src/main.js"}');
  assert.deepEqual(items[0].arguments, { path: 'src/main.js' });
});

import assert from 'node:assert/strict'
import test from 'node:test'

import { formatContextAsMarkdownTable } from '../src/commands/context/context-noninteractive.js'

test('context noninteractive output explains estimate and snapshot scopes', () => {
  const output = formatContextAsMarkdownTable({
    categories: [
      { name: 'System prompt', tokens: 5_000, color: 'promptBorder' },
      { name: 'Messages', tokens: 40_000, color: 'purple_FOR_SUBAGENTS_ONLY' },
      { name: 'Free space', tokens: 155_000, color: 'promptBorder' },
    ],
    totalTokens: 45_000,
    maxTokens: 200_000,
    rawMaxTokens: 200_000,
    percentage: 23,
    gridRows: [],
    model: 'gpt-5.4',
    memoryFiles: [],
    mcpTools: [],
    agents: [],
    isAutoCompactEnabled: true,
    messageBreakdown: {
      toolCallTokens: 11_000,
      toolResultTokens: 19_000,
      attachmentTokens: 2_000,
      assistantMessageTokens: 5_000,
      userMessageTokens: 3_000,
      toolCallsByType: [
        { name: 'Bash', callTokens: 4_000, resultTokens: 16_000 },
      ],
      attachmentsByType: [{ name: 'image/png', tokens: 2_000 }],
    },
    apiUsage: {
      input_tokens: 52_000,
      output_tokens: 3_000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 41_000,
    },
    usageSnapshot: {
      totalInputTokens: 52_000,
      cachedInputTokens: 41_000,
      uncachedInputTokens: 11_000,
      outputTokens: 3_000,
      displayTokens: 55_000,
      cachedInputIncludedInTotalInput: true,
    },
  } as never)

  assert.match(output, /\*\*Packed prompt estimate:\*\* 45k \/ 200k \(23%\)/)
  assert.match(output, /\*\*Last API snapshot:\*\* 55k total/)
  assert.match(output, /\*\*Estimate basis:\*\* categories below sum to this estimate/)
  assert.match(output, /\*\*Estimate vs snapshot:\*\* 10k higher/)
  assert.match(output, /\*\*Largest contributors:\*\* Messages 40k, System prompt 5k\./)
  assert.match(output, /### Message Breakdown/)
  assert.match(output, /\| Total message payload \| 40k \|/)
  assert.match(output, /\| Bash \| 4k \| 16k \|/)
})

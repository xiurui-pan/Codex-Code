import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { resetStateForTests } from '../src/bootstrap/state.js'
import { getTotalCost } from '../src/cost-tracker.js'
import { convertResponsesUsageToAnthropicAndTrack } from '../src/services/api/codexResponsesUsage.js'

afterEach(() => {
  delete process.env.CODEX_CODE_USE_CODEX_PROVIDER
  resetStateForTests()
})

test('Responses usage tracks GPT/Codex cost instead of forcing zero for custom providers', () => {
  process.env.CODEX_CODE_USE_CODEX_PROVIDER = '1'

  convertResponsesUsageToAnthropicAndTrack(
    {
      input_tokens: 1_000_000,
      input_tokens_details: { cached_tokens: 200_000 },
      output_tokens: 500_000,
      total_tokens: 1_500_000,
    },
    'gpt-5.4',
  )

  assert.equal(getTotalCost(), 10.05)
})

test('Responses usage still falls back to zero when there is no usage', () => {
  convertResponsesUsageToAnthropicAndTrack(
    {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    },
    'gpt-5.4-mini',
  )

  assert.equal(getTotalCost(), 0)
})

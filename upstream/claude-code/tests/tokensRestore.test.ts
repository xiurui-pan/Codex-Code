import { afterEach, expect, test } from 'bun:test'
import { resetStateForTests, setCostStateForRestore } from '../src/bootstrap/state.js'
import { getEstimatedCurrentUsage } from '../src/utils/tokens.js'

afterEach(() => {
  resetStateForTests()
})

test('getEstimatedCurrentUsage falls back to restored aggregate totals', () => {
  setCostStateForRestore({
    totalCostUSD: 1.23,
    totalAPIDuration: 10,
    totalAPIDurationWithoutRetries: 10,
    totalToolDuration: 0,
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
    totalInputTokens: 1200,
    totalOutputTokens: 345,
    totalCacheCreationInputTokens: 67,
    totalCacheReadInputTokens: 89,
    totalWebSearchRequests: 2,
    lastDuration: 20,
    modelUsage: undefined,
  })

  expect(getEstimatedCurrentUsage([])).toEqual({
    input_tokens: 1200,
    output_tokens: 345,
    cache_creation_input_tokens: 67,
    cache_read_input_tokens: 89,
  })
})

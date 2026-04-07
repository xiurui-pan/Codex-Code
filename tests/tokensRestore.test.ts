import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { resetStateForTests, setCostStateForRestore } from '../src/bootstrap/state.js'
import {
  getDisplayContextTokenCount,
  getEstimatedCurrentUsage,
} from '../src/utils/tokens.js'

let originalNodeEnv: string | undefined

afterEach(() => {
  resetStateForTests()
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = originalNodeEnv
  }
})

test('getEstimatedCurrentUsage falls back to restored aggregate totals', () => {
  originalNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'test'

  setCostStateForRestore({
    totalCostUSD: 1.23,
    todayCostUSD: 0,
    todayCostDate: undefined,
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

  const result = getEstimatedCurrentUsage([])
  assert.notEqual(result, null)
  assert.equal(result!.input_tokens, 1200)
  assert.equal(result!.output_tokens, 345)
  assert.equal(result!.cache_creation_input_tokens, 67)
  assert.equal(result!.cache_read_input_tokens, 89)
})

test('context surfaces can opt out of restored aggregate totals', () => {
  originalNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'test'

  setCostStateForRestore({
    totalCostUSD: 1.23,
    todayCostUSD: 0,
    todayCostDate: undefined,
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

  assert.equal(
    getEstimatedCurrentUsage([], { includeRestoredTotals: false }),
    null,
  )
  assert.equal(
    getDisplayContextTokenCount([], { includeRestoredTotals: false }),
    0,
  )
})

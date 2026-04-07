import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import {
  calculateContextPercentages,
  calculateContextPercentagesFromTokenCount,
} from '../src/utils/context.js'
import { getDisplayContextUsageBreakdown } from '../src/utils/tokens.js'

const ORIGINAL_CODEX_PROVIDER = process.env.CODEX_CODE_USE_CODEX_PROVIDER

afterEach(() => {
  if (ORIGINAL_CODEX_PROVIDER === undefined) {
    delete process.env.CODEX_CODE_USE_CODEX_PROVIDER
  } else {
    process.env.CODEX_CODE_USE_CODEX_PROVIDER = ORIGINAL_CODEX_PROVIDER
  }
})

test('calculateContextPercentages returns null instead of NaN for incomplete usage', () => {
  assert.deepEqual(
    calculateContextPercentages(
      {
        input_tokens: 1200,
        output_tokens: Number.NaN,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      200_000,
    ),
    { used: null, remaining: null },
  )
})

test('calculateContextPercentages rounds valid usage normally for non-Codex providers', () => {
  delete process.env.CODEX_CODE_USE_CODEX_PROVIDER

  assert.deepEqual(
    calculateContextPercentages(
      {
        input_tokens: 10_000,
        output_tokens: 3_000,
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 500,
      },
      20_000,
    ),
    { used: 25, remaining: 75 },
  )
})

test('calculateContextPercentages avoids double-counting cached input for Codex provider', () => {
  process.env.CODEX_CODE_USE_CODEX_PROVIDER = '1'

  assert.deepEqual(
    getDisplayContextUsageBreakdown({
      input_tokens: 40_000,
      output_tokens: 2_000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 35_000,
    }),
    {
      totalInputTokens: 40_000,
      cachedInputTokens: 35_000,
      uncachedInputTokens: 5_000,
      outputTokens: 2_000,
      displayTokens: 42_000,
      cachedInputIncludedInTotalInput: true,
    },
  )

  assert.deepEqual(
    calculateContextPercentages(
      {
        input_tokens: 40_000,
        output_tokens: 2_000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 35_000,
      },
      100_000,
    ),
    { used: 34, remaining: 66 },
  )
})

test('calculateContextPercentagesFromTokenCount matches codex-rs baseline behavior', () => {
  assert.deepEqual(
    calculateContextPercentagesFromTokenCount(13_679, 272_000),
    { used: 1, remaining: 99 },
  )

  assert.deepEqual(
    calculateContextPercentagesFromTokenCount(12_000, 272_000),
    { used: 0, remaining: 100 },
  )
})

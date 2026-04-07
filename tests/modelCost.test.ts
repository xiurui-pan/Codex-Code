import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { resetStateForTests } from '../src/bootstrap/state.js'
import {
  calculateCostFromTokens,
  getModelPricingString,
  hasKnownModelCost,
} from '../src/utils/modelCost.js'

afterEach(() => {
  resetStateForTests()
})

test('GPT and Codex model ids resolve to priced billing tiers', () => {
  const gpt54Cost = calculateCostFromTokens('gpt-5.4', {
    inputTokens: 1_000_000,
    outputTokens: 500_000,
    cacheReadInputTokens: 200_000,
    cacheCreationInputTokens: 0,
  })
  const gpt54MiniCost = calculateCostFromTokens('gpt-5.4-mini', {
    inputTokens: 1_000_000,
    outputTokens: 500_000,
    cacheReadInputTokens: 200_000,
    cacheCreationInputTokens: 0,
  })
  const codex53Cost = calculateCostFromTokens('gpt-5.3-codex', {
    inputTokens: 1_000_000,
    outputTokens: 500_000,
    cacheReadInputTokens: 200_000,
    cacheCreationInputTokens: 0,
  })
  const codex51MaxCost = calculateCostFromTokens('gpt-5.1-codex-max', {
    inputTokens: 1_000_000,
    outputTokens: 500_000,
    cacheReadInputTokens: 200_000,
    cacheCreationInputTokens: 0,
  })

  assert.equal(gpt54Cost, 10.05)
  assert.equal(gpt54MiniCost, 3.015)
  assert.equal(codex53Cost, 8.785)
  assert.equal(codex51MaxCost, 6.275)
})

test('Codex aliases expose pricing metadata and custom pricing availability', () => {
  assert.equal(getModelPricingString('gpt-5.4'), '$2.50/$15 per Mtok')
  assert.equal(getModelPricingString('gpt-5.4-mini'), '$0.75/$4.50 per Mtok')
  assert.equal(getModelPricingString('gpt-5.2-codex'), '$1.75/$14 per Mtok')
  assert.equal(getModelPricingString('mini'), '$0.75/$4.50 per Mtok')
  assert.equal(getModelPricingString('xhighplan'), '$2.50/$15 per Mtok')
  assert.equal(hasKnownModelCost('gpt-5.1-codex'), true)
  assert.equal(hasKnownModelCost('gpt-5.1-codex-max'), true)
})

test('unknown models remain unavailable for explicit billing checks', () => {
  assert.equal(hasKnownModelCost('unknown-model'), false)
  assert.equal(getModelPricingString('unknown-model'), undefined)
})

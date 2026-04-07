import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { resolvePickerEffortPersistence } from '../src/utils/effort.js'

const ORIGINAL_CODEX_PROVIDER = process.env.CODEX_CODE_USE_CODEX_PROVIDER
const ORIGINAL_ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL

afterEach(() => {
  if (ORIGINAL_CODEX_PROVIDER === undefined) {
    delete process.env.CODEX_CODE_USE_CODEX_PROVIDER
  } else {
    process.env.CODEX_CODE_USE_CODEX_PROVIDER = ORIGINAL_CODEX_PROVIDER
  }

  if (ORIGINAL_ANTHROPIC_BASE_URL === undefined) {
    delete process.env.ANTHROPIC_BASE_URL
  } else {
    process.env.ANTHROPIC_BASE_URL = ORIGINAL_ANTHROPIC_BASE_URL
  }
})

test('custom Codex fast mode no longer maps to the legacy opus model swap', async () => {
  process.env.CODEX_CODE_USE_CODEX_PROVIDER = '1'
  delete process.env.ANTHROPIC_BASE_URL

  const { getFastModeModel, isFastModeSupportedByModel } = await import(
    '../src/utils/fastMode.ts'
  )

  assert.equal(getFastModeModel(), 'gpt-5.4')
  assert.equal(isFastModeSupportedByModel('gpt-5.4'), true)
  assert.equal(isFastModeSupportedByModel('gpt-5.4-mini'), true)
})

test('resolvePickerEffortPersistence keeps an explicit medium selection across model switches', () => {
  assert.equal(
    resolvePickerEffortPersistence('medium', 'medium', 'medium', false, true),
    'medium',
  )
})

test('resolvePickerEffortPersistence clears effort when the target model does not support it', () => {
  assert.equal(
    resolvePickerEffortPersistence('medium', 'medium', 'medium', false, false),
    undefined,
  )
})

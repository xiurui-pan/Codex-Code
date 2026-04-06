import assert from 'node:assert/strict'
import { test } from 'node:test'

import { shouldPrefetchRecentActivityForWelcome } from '../src/utils/logoV2Utils.js'

test('prefetches recent activity when release notes are visible', () => {
  assert.equal(
    shouldPrefetchRecentActivityForWelcome({
      hasReleaseNotes: true,
      showOnboarding: false,
      forceFullLogo: false,
      currentPhaseCustomCodexProvider: false,
    }),
    true,
  )
})

test('prefetches recent activity when onboarding keeps the full welcome UI open', () => {
  assert.equal(
    shouldPrefetchRecentActivityForWelcome({
      hasReleaseNotes: false,
      showOnboarding: true,
      forceFullLogo: false,
      currentPhaseCustomCodexProvider: false,
    }),
    true,
  )
})

test('prefetches recent activity when current phase keeps the full welcome UI open', () => {
  assert.equal(
    shouldPrefetchRecentActivityForWelcome({
      hasReleaseNotes: false,
      showOnboarding: false,
      forceFullLogo: false,
      currentPhaseCustomCodexProvider: true,
    }),
    true,
  )
})

test('does not prefetch recent activity for condensed welcome UI', () => {
  assert.equal(
    shouldPrefetchRecentActivityForWelcome({
      hasReleaseNotes: false,
      showOnboarding: false,
      forceFullLogo: false,
      currentPhaseCustomCodexProvider: false,
    }),
    false,
  )
})

import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  getTodayCostUSD,
  resetStateForTests,
  setCostStateForRestore,
} from '../src/bootstrap/state.js'

function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildRestoreState(overrides: {
  todayCostUSD: number
  todayCostDate: string | undefined
}) {
  return {
    totalCostUSD: 1.23,
    todayCostUSD: overrides.todayCostUSD,
    todayCostDate: overrides.todayCostDate,
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
  }
}

afterEach(() => {
  resetStateForTests()
})

test('restoring same-day today cost keeps the today bucket', () => {
  setCostStateForRestore(
    buildRestoreState({
      todayCostUSD: 0.75,
      todayCostDate: getLocalDateString(),
    }),
  )

  assert.equal(getTodayCostUSD(), 0.75)
})

test('restoring prior-day today cost clears the today bucket', () => {
  setCostStateForRestore(
    buildRestoreState({
      todayCostUSD: 0.75,
      todayCostDate: '2000-01-01',
    }),
  )

  assert.equal(getTodayCostUSD(), 0)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

import { projectRoot } from './helpers/projectRoot.mjs'

const scriptPath = join(projectRoot, 'scripts', 'statusline.mjs')

function runStatusline(input) {
  return execFileSync('node', [scriptPath], {
    cwd: projectRoot,
    input: JSON.stringify(input),
    encoding: 'utf8',
  }).trim()
}

test('repo-local statusline script renders only the model label even when billing data is present', () => {
  const output = runStatusline({
    model: {
      id: 'gpt-5',
      display_name: 'GPT-5',
    },
    cost: {
      total_cost_usd: 1.5,
      today_cost_usd: 0.75,
      total_duration_ms: 1_800_000,
    },
  })

  assert.equal(output, '🤖 GPT-5')
})

test('repo-local statusline script ignores billing blocks for unknown pricing too', () => {
  const output = runStatusline({
    model: {
      id: 'unknown-model',
      display_name: 'Unknown Model',
    },
    cost: {
      billing_available: false,
      total_cost_usd: 9.99,
      today_cost_usd: 1.23,
      total_duration_ms: 1_800_000,
    },
  })

  assert.equal(output, '🤖 Unknown Model')
  assert.doesNotMatch(output, /\$/)
})

test('repo-local statusline script never renders remaining time or billing text', () => {
  const output = runStatusline({
    model: {
      id: 'gpt-5',
      display_name: 'GPT-5',
    },
    cost: {
      total_cost_usd: 0.25,
      total_duration_ms: 3_600_000,
    },
    rate_limits: {
      five_hour: {
        used_percentage: 50,
        resets_at: 1_700_000_000,
      },
    },
  })

  assert.equal(output, '🤖 GPT-5')
  assert.doesNotMatch(output, /remaining|left|5h|7d|today|session|\/hr|\$/i)
})

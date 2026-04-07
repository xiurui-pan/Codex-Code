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

test('repo-local statusline script renders session and today billing when both are provided', () => {
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

  assert.match(output, /^🤖 GPT-5 \| 💰 \$1\.50 session \/ \$0\.75 today \/ \$3\.00\/hr$/)
})

test('repo-local statusline script omits today billing when the payload does not provide it', () => {
  const output = runStatusline({
    model: {
      id: 'gpt-5',
      display_name: 'GPT-5',
    },
    cost: {
      total_cost_usd: 1.5,
      total_duration_ms: 1_800_000,
    },
  })

  assert.match(output, /^🤖 GPT-5 \| 💰 \$1\.50 session \/ \$3\.00\/hr$/)
  assert.doesNotMatch(output, /today/)
})

test('repo-local statusline script omits today billing when today cost is zero', () => {
  const output = runStatusline({
    model: {
      id: 'gpt-5',
      display_name: 'GPT-5',
    },
    cost: {
      total_cost_usd: 1.5,
      today_cost_usd: 0,
      total_duration_ms: 1_800_000,
    },
  })

  assert.match(output, /^🤖 GPT-5 \| 💰 \$1\.50 session \/ \$3\.00\/hr$/)
  assert.doesNotMatch(output, /today/)
})

test('repo-local statusline script omits billing when provider pricing is unavailable', () => {
  const output = runStatusline({
    model: {
      id: 'gpt-5',
      display_name: 'GPT-5',
    },
    cost: {
      billing_available: false,
      total_cost_usd: 9.99,
      today_cost_usd: 1.23,
      total_duration_ms: 1_800_000,
    },
  })

  assert.equal(output, '🤖 GPT-5')
  assert.doesNotMatch(output, /\$/)
})

test('repo-local statusline script never renders remaining hours text', () => {
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

  assert.doesNotMatch(output, /remaining|left|5h|7d/i)
})

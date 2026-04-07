import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

function readSource(path) {
  return readFileSync(join(projectRoot, path), 'utf8')
}

test('StatusLine replaces explicit context N/A placeholders with live context usage', () => {
  const source = readSource('src/components/StatusLine.tsx')

  assert.match(source, /function buildContextWindowSummary/)
  assert.match(source, /if \(\/🧠\[\^\|]\*\/\.test\(text\)\)/)
  assert.match(source, /return text\.replace\(\/🧠\[\^\|]\*\/g, contextSummary\)/)
  assert.match(source, /return `\$\{text\} \| \$\{contextSummary\}`/)
})

test('StatusLine context summary uses the shared display token count helper', () => {
  const source = readSource('src/components/StatusLine.tsx')

  assert.match(source, /getDisplayContextTokenCount/)
  assert.match(source, /includeRestoredTotals: false/)
  assert.match(source, /const displayContextTokens = getDisplayContextTokenCount\(messages, \{/)
  assert.match(source, /calculateContextPercentagesFromTokenCount\(displayContextTokens, contextWindowSize\)/)
  assert.match(
    source,
    /const usedPercentage = calculateContextPercentagesFromTokenCount\(totalTokens, contextWindowSize\)\.used/,
  )
  assert.match(
    source,
    /return `🧠 \$\{formatUsedTokensForStatusLine\(totalTokens\)\} \/ \$\{formatTokenCountForStatusLine\(contextWindowSize\)\} \(\$\{usedPercentage \?\? 0\}%\)`/,
  )
  assert.match(
    source,
    /return `🧠 \$\{formatTokenCountForStatusLine\(contextWindowSize\)\} window`/,
  )
})

test('StatusLine statusline payload includes session and today billing data', () => {
  const source = readSource('src/components/StatusLine.tsx')

  assert.match(source, /billing_available: hasKnownModelCost\(runtimeModel\)/)
  assert.match(source, /import \{ hasKnownModelCost \} from '..\/utils\/modelCost\.js';/)
  assert.match(source, /today_cost_usd: getTodayCost\(\)/)
  assert.match(source, /total_cost_usd: getTotalCost\(\)/)
  assert.match(source, /total_duration_ms: getTotalDuration\(\)/)
})

test('StatusLine payload exposes current context tokens and provider-aware session token totals', () => {
  const source = readSource('src/components/StatusLine.tsx')

  assert.match(source, /current_tokens: displayContextTokens/)
  assert.match(source, /token_usage: \{/)
  assert.match(source, /used_tokens: sessionTokenUsage\.displayTokens/)
  assert.match(source, /cached_input_tokens: sessionTokenUsage\.cachedInputTokens/)
  assert.match(source, /uncached_input_tokens: sessionTokenUsage\.uncachedInputTokens/)
})

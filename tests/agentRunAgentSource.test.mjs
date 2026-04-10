import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const runAgentSource = readFileSync(
  new URL('../src/tools/AgentTool/runAgent.ts', import.meta.url),
  'utf8',
)

test('one-shot built-in agents request a final text-only response when they stop on tool results', () => {
  assert.match(runAgentSource, /shouldRequestBuiltInFinalResponse/)
  assert.match(runAgentSource, /ONE_SHOT_BUILTIN_AGENT_TYPES/)
  assert.match(runAgentSource, /Provide your final findings now using the evidence already collected\./)
  assert.match(runAgentSource, /Provide the final implementation plan now using the evidence already collected\./)
  assert.match(runAgentSource, /tools: \[\]/)
  assert.match(runAgentSource, /canUseTool: async \(\) => false/)
})

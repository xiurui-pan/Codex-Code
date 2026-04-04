import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const promptSource = readFileSync(new URL('../src/tools/EnterPlanModeTool/prompt.ts', import.meta.url), 'utf8')
const runAgentSource = readFileSync(new URL('../src/tools/AgentTool/runAgent.ts', import.meta.url), 'utf8')
const agentToolSource = readFileSync(new URL('../src/tools/AgentTool/AgentTool.tsx', import.meta.url), 'utf8')

test('codex provider uses conservative EnterPlanMode prompt branch', () => {
  assert.match(promptSource, /process\.env\.USER_TYPE === 'ant' \|\|\s*isCurrentPhaseCustomCodexProvider\(\)/)
  assert.match(promptSource, /When in doubt, prefer starting work and using \$\{ASK_USER_QUESTION_TOOL_NAME\} for specific questions over entering a full planning phase\./)
})

test('subagent execution treats non-completed terminal reasons as errors', () => {
  assert.match(runAgentSource, /export class IncompleteAgentExecutionError extends Error/)
  assert.match(runAgentSource, /if \(terminalReason && terminalReason !== 'completed'\) \{/)
  assert.match(agentToolSource, /syncAgentError instanceof IncompleteAgentExecutionError/)
})

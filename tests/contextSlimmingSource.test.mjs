import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

function readSource(path) {
  return readFileSync(join(projectRoot, path), 'utf8')
}

test('codex mode defaults git prompt context off and strips Claude product copy', () => {
  const gitSettings = readSource('src/utils/gitSettings.ts')
  const prompts = readSource('src/constants/prompts.ts')

  assert.match(
    gitSettings,
    /process\.env\.CODEX_CODE_USE_CODEX_PROVIDER === '1'[\s\S]*includeGitInstructions \?\? false/,
  )
  assert.doesNotMatch(prompts, /The most recent Claude model family/)
  assert.doesNotMatch(prompts, /Codex Code is available as a CLI/)
  assert.doesNotMatch(prompts, /Fast mode for Codex Code uses the same/)
})

test('codex mode disables hidden delta-attachment systems and prompt-side startup clutter', () => {
  const toolSearch = readSource('src/utils/toolSearch.ts')
  const mcpDelta = readSource('src/utils/mcpInstructionsDelta.ts')
  const agentPrompt = readSource('src/tools/AgentTool/prompt.ts')
  const repl = readSource('src/screens/REPL.tsx')

  assert.match(
    toolSearch,
    /process\.env\.CODEX_CODE_USE_CODEX_PROVIDER === '1'[\s\S]*return false/,
  )
  assert.match(
    mcpDelta,
    /process\.env\.CODEX_CODE_USE_CODEX_PROVIDER === '1'\) return false/,
  )
  assert.match(
    agentPrompt,
    /process\.env\.CODEX_CODE_USE_CODEX_PROVIDER === '1'[\s\S]*return false/,
  )
  assert.doesNotMatch(repl, /desktop-upsell/)
  assert.doesNotMatch(repl, /plugin-hint/)
  assert.doesNotMatch(repl, /AwsAuthStatusBox/)
  assert.doesNotMatch(repl, /usePromptsFromClaudeInChromeForCurrentStage/)
})

test('attachment collector drops hidden budget and delta reminders from the default prompt path', () => {
  const attachments = readSource('src/utils/attachments.ts')

  for (const pattern of [
    /maybe\('token_usage'/,
    /maybe\('budget_usd'/,
    /maybe\('output_token_usage'/,
    /maybe\('verify_plan_reminder'/,
    /maybe\('compaction_reminder'/,
    /maybe\('context_efficiency'/,
    /maybe\('deferred_tools_delta'/,
    /maybe\('agent_listing_delta'/,
    /maybe\('mcp_instructions_delta'/,
    /maybe\('companion_intro'/,
  ]) {
    assert.doesNotMatch(attachments, pattern)
  }
})

test('api key verification hook is now a Codex-first no-op', () => {
  const source = readSource('src/hooks/useApiKeyVerification.ts')

  assert.match(source, /status: 'valid'/)
  assert.doesNotMatch(source, /verifyModelAccess/)
  assert.doesNotMatch(source, /getAnthropicApiKeyWithSource/)
})

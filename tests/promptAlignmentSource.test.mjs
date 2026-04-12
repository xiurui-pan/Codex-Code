import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

function readSource(path) {
  return readFileSync(join(projectRoot, path), 'utf8')
}

test('system prompt restores brief milestone updates without command echoing', () => {
  const source = readSource('src/constants/prompts.ts')

  assert.match(source, /Be concise, but do not go silent\./)
  assert.match(
    source,
    /Before making tool calls, send a brief preamble to the user explaining what you are about to do\./,
  )
  assert.match(source, /Logically group related actions:/)
  assert.match(source, /Build on prior context:/)
  assert.match(
    source,
    /Exception: skip the preamble for straightforward single reads, one-off local searches, or other trivial checks unless they are part of a larger grouped action\./,
  )
  assert.match(
    source,
    /I’ve explored the repo; now checking the API route definitions\./,
  )
  assert.match(source, /Do not narrate the terminal\./)
  assert.match(
    source,
    /Do not repeat exact shell commands, tool names, raw arguments, permission waits, or "done" boilerplate/,
  )
  assert.doesNotMatch(
    source,
    /they can see your tool calls\./,
  )
  assert.doesNotMatch(source, /before tool batches and at natural milestones\./)
})

test('codex mode no longer forces the stronger Claude-style communication section', () => {
  const source = readSource('src/constants/prompts.ts')

  assert.match(source, /if \(process\.env\.USER_TYPE === 'ant'\) \{/)
  assert.match(source, /if \(process\.env\.USER_TYPE === 'ant'\) \{\s+return `# Communicating with the user/s)
  assert.doesNotMatch(
    source,
    /After a few consecutive tool-only turns, pause and send one short progress update before continuing\./,
  )
})

test('system prompt now prefers shell ripgrep for simple local searches', () => {
  const source = readSource('src/constants/prompts.ts')

  assert.ok(
    source.includes(
      'For straightforward local searches, prefer \\`rg --files\\`, \\`rg\\`, or \\`find\\` via the ${BASH_TOOL_NAME} tool',
    ),
  )
  assert.match(
    source,
    /For simple, directed codebase searches \(e\.g\. a specific file, class, or function\) prefer \$\{searchTools\} first\./,
  )
})

test('agent guidance trusts concrete research results instead of redoing the search', () => {
  const source = readSource('src/tools/AgentTool/prompt.ts')

  assert.match(source, /Delegate the digging, keep the final decision\./)
  assert.match(source, /Trust completed research results by default\./)
  assert.match(
    source,
    /use that evidence directly instead of repeating the same repo-wide search yourself/,
  )
})

test('search tool prompts allow direct ripgrep for straightforward lookups', () => {
  const grepPrompt = readSource('src/tools/GrepTool/prompt.ts')
  const globPrompt = readSource('src/tools/GlobTool/prompt.ts')

  assert.ok(
    grepPrompt.includes(
      'For straightforward local searches, \\`rg\\` via the ${BASH_TOOL_NAME} tool is often the fastest path.',
    ),
  )
  assert.ok(
    globPrompt.includes(
      'For straightforward local file-name searches, \\`rg --files\\` or \\`find\\` via the Bash tool is often faster',
    ),
  )
})

test('leaner context path drops output-style attachments and broad main-thread skill listings', () => {
  const source = readSource('src/utils/attachments.ts')

  assert.doesNotMatch(source, /maybe\('output_style'/)
  assert.match(
    source,
    /Skip the broad initial listing there to keep[\s\S]*!toolUseContext\.agentId/,
  )
})

test('ultrathink and ultraplan keywords now stay local and use model-aware effort', () => {
  const processSource = readSource('src/utils/processUserInput/processUserInput.ts')
  const promptInputSource = readSource('src/components/PromptInput/PromptInput.tsx')
  const attachmentSource = readSource('src/utils/attachments.ts')

  assert.match(
    processSource,
    /getUltrathinkEffortLevel\(\s*context\.options\.mainLoopModel,\s*\)/,
  )
  assert.match(processSource, /hasUltrathinkKeyword\(ultrathinkInput\)/)
  assert.match(
    promptInputSource,
    /text:\s*ultrathinkEffortLevel\s*\?\s*`Effort set to \$\{ultrathinkEffortLevel\} for this turn`\s*:\s*'This turn will use deeper reasoning'/,
  )
  assert.match(
    promptInputSource,
    /This prompt will ask Codex to deepen the plan in this session/,
  )
  assert.match(
    attachmentSource,
    /getUltrathinkEffortAttachment\(input, toolUseContext\.options\.mainLoopModel\)/,
  )
})

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = new URL('..', import.meta.url)

function readSource(relativePath) {
  return fs
    .readFileSync(path.join(repoRoot.pathname, relativePath), 'utf8')
    .replace(/\n\/\/# sourceMappingURL=data:application\/json[^\n]*$/s, '')
}

test('custom Codex provider uses the conservative plan-mode prompt', () => {
  const source = readSource('src/tools/EnterPlanModeTool/prompt.ts')

  assert.match(source, /isCurrentPhaseCustomCodexProvider\(\)/)
  assert.match(
    source,
    /process\.env\.USER_TYPE === 'ant' \|\|\s+isCurrentPhaseCustomCodexProvider\(\)\s+\? getEnterPlanModeToolPromptAnt\(\)/,
  )
})

test('custom Codex provider keeps the iterative interview-style plan workflow', () => {
  const source = readSource('src/utils/planModeV2.ts')

  assert.match(source, /isCurrentPhaseCustomCodexProvider\(\)/)
  assert.match(
    source,
    /if \(isCurrentPhaseCustomCodexProvider\(\)\) return true/,
  )
})

test('background main-session tasks only report success on completed terminal reason', () => {
  const source = readSource('src/tasks/LocalMainSessionTask.ts')

  assert.match(source, /let terminalReason: string \| null = null/)
  assert.match(source, /terminalReason = step\.value\.reason/)
  assert.match(source, /const success = terminalReason === 'completed'/)
  assert.match(source, /completeMainSessionTask\(taskId, success, setAppState\)/)
})

test('plan-mode clear-context usage comes from the current message context', () => {
  const source = readSource(
    'src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
  )

  assert.match(source, /const messages = useAppState\(s => s\.messages\)/)
  assert.match(source, /return \[\.\.\.messages, toolUseConfirm\.assistantMessage\]/)
  assert.match(
    source,
    /const usage = getEstimatedCurrentUsage\(messages,\s*\{[\s\S]*includeRestoredTotals:\s*false[\s\S]*\}\);/,
  )
  assert.doesNotMatch(
    source,
    /const usage = toolUseConfirm\.assistantMessage\.message\.usage;/,
  )
})

test('exit plan mode refuses empty plans and keeps user in plan mode', () => {
  const exitToolSource = readSource('src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts')
  const permissionUiSource = readSource(
    'src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
  )

  assert.match(exitToolSource, /if \(!plan \|\| plan\.trim\(\) === ''\) \{/)
  assert.match(
    exitToolSource,
    /Stay in plan mode, write the full plan, then call \$\{EXIT_PLAN_MODE_V2_TOOL_NAME\} again\./,
  )
  assert.match(permissionUiSource, /Plan file is still empty\. Continue planning before exit\./)
  assert.match(permissionUiSource, /label: 'Got it, keep planning'/)
  assert.doesNotMatch(permissionUiSource, /label: 'Yes'/)
})

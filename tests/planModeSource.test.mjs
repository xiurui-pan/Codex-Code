import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = new URL('..', import.meta.url)

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot.pathname, relativePath), 'utf8')
}

test('custom Codex provider uses the conservative plan-mode prompt', () => {
  const source = readSource('src/tools/EnterPlanModeTool/prompt.ts')

  assert.match(source, /isCurrentPhaseCustomCodexProvider\(\)/)
  assert.match(
    source,
    /process\.env\.USER_TYPE === 'ant' \|\|\s+isCurrentPhaseCustomCodexProvider\(\)\s+\? getEnterPlanModeToolPromptAnt\(\)/,
  )
})

test('background main-session tasks only report success on completed terminal reason', () => {
  const source = readSource('src/tasks/LocalMainSessionTask.ts')

  assert.match(source, /let terminalReason: string \| null = null/)
  assert.match(source, /terminalReason = step\.value\.reason/)
  assert.match(source, /const success = terminalReason === 'completed'/)
  assert.match(source, /completeMainSessionTask\(taskId, success, setAppState\)/)
})

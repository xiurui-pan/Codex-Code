import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const cwd = '/home/pxr/workspace/CodingAgent/Codex-Code/upstream/claude-code'

async function runBehavior(mode) {
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      '--loader',
      './dist/loader.mjs',
      './tests/helpers/codexResponses.behaviorRunner.mjs',
      mode,
    ],
    {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    },
  )

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    stdout += chunk
  })
  child.stderr.on('data', chunk => {
    stderr += chunk
  })

  const [code] = await once(child, 'close')
  assert.equal(code, 0, stderr || `child exited with ${code}`)
  return JSON.parse(stdout)
}

test('mergeStreamedAssistantMessages preserves intermediate turn items', async () => {
  const result = await runBehavior('merge')

  assert.deepEqual(result.turnItemKinds, [
    'final_answer',
    'local_shell_call',
    'tool_call',
    'final_answer',
  ])
  assert.deepEqual(result.content, ['first', 'tool_use', 'second'])
})

test('queryCodexResponses aggregates streamed items instead of only returning the last assistant message', async () => {
  const result = await runBehavior('query')

  assert.deepEqual(result.turnItemKinds, [
    'tool_call',
    'local_shell_call',
    'final_answer',
  ])
  assert.deepEqual(result.content, ['tool_use', 'done'])
})

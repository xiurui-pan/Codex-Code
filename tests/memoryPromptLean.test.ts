import assert from 'node:assert/strict'
import test from 'node:test'

import { buildMemoryLines } from '../src/memdir/memdir.js'
import { getClaudeMds } from '../src/utils/claudemd.js'

test('memory prompt keeps the workflow but drops the old handbook-sized sections', () => {
  const prompt = buildMemoryLines('auto memory', '/tmp/codex-memory/', [], false)
    .join('\n')

  assert.match(prompt, /Use memory for durable information/)
  assert.match(prompt, /Use plans or tasks for work that only matters inside the current conversation/)
  assert.doesNotMatch(prompt, /## Types of memory/)
  assert.doesNotMatch(prompt, /## Memory and other forms of persistence/)
})

test('memory injection keeps a bounded total size and records when files are skipped', () => {
  const repeated = 'important memory line\n'.repeat(2500)
  const prompt = getClaudeMds([
    {
      path: '/tmp/project/CLAUDE.md',
      type: 'Project',
      content: repeated,
    },
    {
      path: '/tmp/user/CLAUDE.md',
      type: 'User',
      content: repeated,
    },
    {
      path: '/tmp/auto/MEMORY.md',
      type: 'AutoMem',
      content: repeated,
    },
  ])

  assert.ok(prompt.length < 36000, `prompt too large: ${prompt.length}`)
  assert.match(
    prompt,
    /Additional memory files were skipped|truncated to fit prompt budget/,
  )
})

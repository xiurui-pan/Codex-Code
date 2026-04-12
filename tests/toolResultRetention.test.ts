import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compactToolUseResultForStorage,
  summarizeStoredOutputText,
  summarizeStoredToolResult,
} from '../src/utils/toolResultRetention.js'

test('compactToolUseResultForStorage removes legacy originalFile payloads', () => {
  const compacted = compactToolUseResultForStorage('Edit', {
    filePath: '/tmp/demo.ts',
    oldString: 'a',
    newString: 'b',
    firstLine: 'const a = 1',
    originalFile: 'very large original file',
    structuredPatch: [],
    userModified: false,
    replaceAll: false,
  }) as { originalFile?: string; filePath: string }

  assert.equal(compacted.filePath, '/tmp/demo.ts')
  assert.equal('originalFile' in compacted, false)
})

test('summarizeStoredToolResult shortens generic shell output for storage', () => {
  const summary = summarizeStoredToolResult({
    toolName: 'Bash',
    toolUseResult: {
      stdout: 'x'.repeat(5000),
      stderr: '',
    },
  })

  assert.ok(summary)
  assert.equal(summary!.length <= 1025, true)
  assert.equal(summary!.endsWith('…'), true)
})

test('summarizeStoredOutputText keeps short strings unchanged', () => {
  assert.equal(summarizeStoredOutputText('ok'), 'ok')
})

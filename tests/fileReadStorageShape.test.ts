import assert from 'node:assert/strict'
import test from 'node:test'

import { buildToolResultItemsForLocalExecution } from '../src/services/api/localExecutionItems.js'
import {
  compactFileReadOutputForStorage,
  FILE_READ_STORED_TEXT_OMITTED,
  summarizeFileReadOutput,
} from '../src/tools/FileReadTool/storageShape.js'

test('compactFileReadOutputForStorage strips text payload but keeps metadata', () => {
  const compacted = compactFileReadOutputForStorage({
    type: 'text',
    file: {
      filePath: '/tmp/demo.ts',
      content: 'line 1\nline 2',
      numLines: 2,
      startLine: 1,
      totalLines: 2,
    },
  })

  assert.equal(compacted.type, 'text')
  assert.equal(compacted.file.content, FILE_READ_STORED_TEXT_OMITTED)
  assert.equal(compacted.file.storedContentOmitted, true)
  assert.equal(compacted.file.numLines, 2)
  assert.equal(compacted.file.totalLines, 2)
})

test('compactFileReadOutputForStorage strips notebook cells but keeps count', () => {
  const compacted = compactFileReadOutputForStorage({
    type: 'notebook',
    file: {
      filePath: '/tmp/demo.ipynb',
      cells: [{ a: 1 }, { b: 2 }],
    },
  })

  assert.equal(compacted.type, 'notebook')
  assert.deepEqual(compacted.file.cells, [])
  assert.equal(compacted.file.cellCount, 2)
  assert.equal(compacted.file.storedCellsOmitted, true)
})

test('summarizeFileReadOutput returns a short read summary', () => {
  const summary = summarizeFileReadOutput({
    type: 'text',
    file: {
      filePath: '/tmp/demo.ts',
      content: 'line 1\nline 2',
      numLines: 2,
      startLine: 1,
      totalLines: 2,
    },
  })

  assert.equal(summary, 'Read 2 lines from /tmp/demo.ts')
})

test('local execution items can override outputText for persisted summaries', () => {
  const items = buildToolResultItemsForLocalExecution(
    'tool-1',
    'Read',
    {
      type: 'tool_result',
      tool_use_id: 'tool-1',
      content: 'very large read payload',
    },
    'tool_execution',
    'Read 200 lines from /tmp/demo.ts',
  )

  const toolOutput = items.find(item => item.kind === 'tool_output')
  assert.equal(toolOutput?.outputText, 'Read 200 lines from /tmp/demo.ts')
})

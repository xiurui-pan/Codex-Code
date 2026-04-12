import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { loadTranscriptFile } from '../src/utils/sessionStorage.js'
import { FILE_READ_STORED_TEXT_OMITTED } from '../src/tools/FileReadTool/storageShape.js'

test('loadTranscriptFile compacts stored read payload duplicates in memory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccx-read-load-'))
  const file = join(dir, 'session.jsonl')
  const largeContent = 'alpha\n'.repeat(5000)
  const line = JSON.stringify({
    type: 'user',
    parentUuid: null,
    isSidechain: false,
    uuid: '11111111-1111-1111-1111-111111111111',
    timestamp: '2026-04-12T00:00:00.000Z',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tool-read-1',
          content: largeContent,
        },
      ],
    },
    toolUseResult: {
      type: 'text',
      file: {
        filePath: '/tmp/demo.ts',
        content: largeContent,
        numLines: 5000,
        startLine: 1,
        totalLines: 5000,
      },
    },
    modelTurnItems: [
      {
        kind: 'tool_output',
        provider: 'custom',
        toolUseId: 'tool-read-1',
        outputText: largeContent,
        source: 'tool_execution',
      },
    ],
  })
  await writeFile(file, `${line}\n`, 'utf8')

  const { messages } = await loadTranscriptFile(file)
  const message = messages.get('11111111-1111-1111-1111-111111111111')

  assert.ok(message)
  assert.equal(message?.type, 'user')
  const result = message?.toolUseResult as
    | {
        type: 'text'
        file: {
          content: string
          storedContentOmitted?: boolean
        }
      }
    | undefined
  assert.equal(result?.type, 'text')
  assert.equal(result?.file.content, FILE_READ_STORED_TEXT_OMITTED)
  assert.equal(result?.file.storedContentOmitted, true)

  const toolOutput = message?.modelTurnItems?.find(
    item => item.kind === 'tool_output',
  )
  assert.equal(toolOutput?.kind, 'tool_output')
  assert.equal(
    toolOutput && 'outputText' in toolOutput ? toolOutput.outputText : undefined,
    'Read 5000 lines from /tmp/demo.ts',
  )
})

test('loadTranscriptFile drops legacy originalFile payloads from edit results', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccx-edit-load-'))
  const file = join(dir, 'session.jsonl')
  const line = JSON.stringify({
    type: 'user',
    parentUuid: null,
    isSidechain: false,
    uuid: '22222222-2222-2222-2222-222222222222',
    timestamp: '2026-04-12T00:00:00.000Z',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tool-edit-1',
          content: 'The file /tmp/demo.ts has been updated successfully.',
        },
      ],
    },
    toolUseResult: {
      filePath: '/tmp/demo.ts',
      oldString: 'a',
      newString: 'b',
      firstLine: 'const a = 1',
      originalFile: 'very large original file',
      structuredPatch: [],
      userModified: false,
      replaceAll: false,
    },
    modelTurnItems: [
      {
        kind: 'tool_output',
        provider: 'custom',
        toolUseId: 'tool-edit-1',
        outputText: 'x'.repeat(5000),
        source: 'tool_execution',
      },
    ],
  })
  await writeFile(file, `${line}\n`, 'utf8')

  const { messages } = await loadTranscriptFile(file)
  const message = messages.get('22222222-2222-2222-2222-222222222222')
  const result = message?.toolUseResult as
    | {
        originalFile?: string
        filePath: string
      }
    | undefined

  assert.ok(message)
  assert.equal(result?.filePath, '/tmp/demo.ts')
  assert.equal('originalFile' in (result ?? {}), false)

  const toolOutput = message?.modelTurnItems?.find(
    item => item.kind === 'tool_output',
  )
  assert.equal(toolOutput?.kind, 'tool_output')
  assert.equal(
    toolOutput && 'outputText' in toolOutput ? toolOutput.outputText.endsWith('…') : false,
    true,
  )
})

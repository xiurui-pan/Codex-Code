import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

const source = readFileSync(
  join(projectRoot, 'src/services/SessionMemory/prompts.ts'),
  'utf8',
)

test('session memory prompt requires filling key sections instead of leaving a blank template', () => {
  assert.match(
    source,
    /If the current notes are still mostly the untouched template, fill the key sections from scratch using the conversation above\./,
  )
  assert.match(
    source,
    /After any substantive conversation, do NOT leave the file as a near-empty template\./,
  )
  assert.match(
    source,
    /At minimum, update "Session Title", "Current State", "Task specification", "Files and Functions", and "Worklog"/,
  )
  assert.match(
    source,
    /"Current State" must mention the latest completed action, the current stopping point, and the exact next step if one exists\./,
  )
})

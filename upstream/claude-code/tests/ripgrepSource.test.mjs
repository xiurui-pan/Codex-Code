import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const SOURCE_PATH =
  '/home/pxr/workspace/CodingAgent/Codex-Code/upstream/claude-code/src/utils/ripgrep.ts'

test('ripgrep config falls back to system rg when bundled binary is missing', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8')

  assert.match(source, /!existsSync\(command\) && systemPath !== 'rg'/)
  assert.match(source, /return \{ mode: 'system', command: 'rg', args: \[\] \}/)
})

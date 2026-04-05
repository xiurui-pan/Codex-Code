import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { projectRoot } from './helpers/projectRoot.mjs'
import { join } from 'node:path'

const SOURCE_PATH = join(projectRoot, 'src/utils/ripgrep.ts')

test('ripgrep config falls back to system rg when bundled binary is missing', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8')

  assert.match(source, /!existsSync\(command\) && systemPath !== 'rg'/)
  assert.match(source, /return \{ mode: 'system', command: 'rg', args: \[\] \}/)
})

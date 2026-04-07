import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { projectRoot } from './helpers/projectRoot.mjs'

test('ConfigTool exposes modelContextWindow as a codex config setting', () => {
  const supportedSettings = readFileSync(
    join(projectRoot, 'src/tools/ConfigTool/supportedSettings.ts'),
    'utf8',
  )
  const prompt = readFileSync(
    join(projectRoot, 'src/tools/ConfigTool/prompt.ts'),
    'utf8',
  )

  assert.match(supportedSettings, /modelContextWindow:/)
  assert.match(supportedSettings, /source: 'codex'/)
  assert.match(supportedSettings, /type: 'number'/)
  assert.match(prompt, /Change context window: \{ "setting": "modelContextWindow", "value": 400000 \}/)
  assert.match(prompt, /~\/\.codex\/config\.toml/)
})

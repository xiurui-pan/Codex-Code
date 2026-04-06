import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = new URL('..', import.meta.url)

function readSource(relativePath) {
  return fs
    .readFileSync(path.join(repoRoot.pathname, relativePath), 'utf8')
    .replace(/\n\/\/# sourceMappingURL=data:application\/json[^\n]*$/s, '')
}

test(
  'custom Codex provider still honors CLI permission modes at startup',
  () => {
    const source = readSource('src/main.tsx')

    assert.match(
      source,
      /const \{\s*mode: permissionMode,\s*notification: permissionModeNotification\s*\} = initialPermissionModeFromCLI\(\{\s*permissionModeCli,\s*dangerouslySkipPermissions\s*\}\);/s,
    )
    assert.doesNotMatch(
      source,
      /currentPhaseCustomCodexProvider\s*\?\s*\{\s*mode:\s*'default'/s,
    )
    assert.doesNotMatch(
      source,
      /currentPhaseCustomCodexProvider\s*&&\s*isBareMode\(\)\s*\?\s*\{\s*toolPermissionContext:\s*getEmptyToolPermissionContext\(\)/s,
    )
    assert.match(
      source,
      /setSessionBypassPermissionsMode\(permissionMode === 'bypassPermissions'\);/,
    )
  },
)

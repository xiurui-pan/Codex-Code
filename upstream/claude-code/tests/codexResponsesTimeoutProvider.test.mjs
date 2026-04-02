import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const SOURCE_PATH =
  '/home/pxr/workspace/CodingAgent/Codex-Code/upstream/claude-code/src/services/api/codexResponses.ts'

test('codexResponses provider chain: has explicit request-stage timeout for hanging fetch', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8')

  assert.match(source, /CODEX_RESPONSES_REQUEST_TIMEOUT_MS/)
  assert.match(source, /DEFAULT_REQUEST_TIMEOUT_MS = 30_000/)
  assert.match(source, /async function fetchWithRequestTimeout/)
  assert.match(
    source,
    /request timed out \(waiting for response\) after \$\{requestTimeoutMs\}ms/,
  )
  assert.match(
    source,
    /fetchWithRequestTimeout\(getResponsesBaseUrl\(\),/,
  )
})

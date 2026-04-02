import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import test from 'node:test'

const cwd = '/home/pxr/workspace/CodingAgent/Codex-Code/upstream/claude-code'

async function readProviderState(envOverrides) {
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `
        import {
          getAPIProvider,
          isFirstPartyAnthropicBaseUrl,
        } from './src/utils/model/providers.ts'

        process.stdout.write(
          JSON.stringify({
            provider: getAPIProvider(),
            firstPartyBaseUrl: isFirstPartyAnthropicBaseUrl(),
          }),
        )
      `,
    ],
    {
      cwd,
      env: {
        ...process.env,
        ...envOverrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    stdout += chunk
  })
  child.stderr.on('data', chunk => {
    stderr += chunk
  })

  const [code] = await once(child, 'close')
  assert.equal(code, 0, stderr || `child exited with ${code}`)
  return JSON.parse(stdout)
}

test('Codex-only flag wins over legacy provider flags and disables first-party fallback checks', async () => {
  const result = await readProviderState({
    CLAUDE_CODE_USE_CODEX_PROVIDER: '1',
    CLAUDE_CODE_USE_BEDROCK: '1',
    CLAUDE_CODE_USE_VERTEX: '1',
    CLAUDE_CODE_USE_FOUNDRY: '1',
    ANTHROPIC_BASE_URL: '',
  })

  assert.equal(result.provider, 'custom')
  assert.equal(result.firstPartyBaseUrl, false)
})

test('without Codex-only flag, first-party default behavior stays unchanged', async () => {
  const result = await readProviderState({
    CLAUDE_CODE_USE_CODEX_PROVIDER: '',
    CLAUDE_CODE_USE_BEDROCK: '',
    CLAUDE_CODE_USE_VERTEX: '',
    CLAUDE_CODE_USE_FOUNDRY: '',
    ANTHROPIC_BASE_URL: '',
  })

  assert.equal(result.provider, 'firstParty')
  assert.equal(result.firstPartyBaseUrl, true)
})

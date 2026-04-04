import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
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
          shouldUseAnthropicFirstPartyApiFeatures,
        } from './src/utils/model/providers.ts'

        process.stdout.write(
          JSON.stringify({
            provider: getAPIProvider(),
            firstPartyBaseUrl: isFirstPartyAnthropicBaseUrl(),
            firstPartyFeatures: shouldUseAnthropicFirstPartyApiFeatures(),
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
    CODEX_CODE_USE_CODEX_PROVIDER: '1',
    CODEX_CODE_USE_BEDROCK: '1',
    CODEX_CODE_USE_VERTEX: '1',
    CODEX_CODE_USE_FOUNDRY: '1',
    ANTHROPIC_BASE_URL: '',
  })

  assert.equal(result.provider, 'custom')
  assert.equal(result.firstPartyBaseUrl, false)
  assert.equal(result.firstPartyFeatures, false)
})

test('without Codex-only flag, first-party default behavior stays unchanged', async () => {
  const result = await readProviderState({
    CODEX_CODE_USE_CODEX_PROVIDER: '',
    CODEX_CODE_USE_BEDROCK: '',
    CODEX_CODE_USE_VERTEX: '',
    CODEX_CODE_USE_FOUNDRY: '',
    ANTHROPIC_BASE_URL: '',
  })

  assert.equal(result.provider, 'firstParty')
  assert.equal(result.firstPartyBaseUrl, true)
  assert.equal(result.firstPartyFeatures, true)
})

test('request preflight and params builder use the narrowed first-party helper', async () => {
  const [preflightSource, paramsBuilderSource] = await Promise.all([
    readFile(
      `${cwd}/src/services/api/requestPreflightState.ts`,
      'utf8',
    ),
    readFile(
      `${cwd}/src/services/api/requestParamsBuilder.ts`,
      'utf8',
    ),
  ])

  assert.match(
    preflightSource,
    /shouldUseAnthropicFirstPartyApiFeatures\(\)/,
  )
  assert.doesNotMatch(preflightSource, /getAPIProvider\(\) === 'firstParty'/)

  assert.match(
    paramsBuilderSource,
    /shouldUseAnthropicFirstPartyApiFeatures\(\)/,
  )
  assert.doesNotMatch(
    paramsBuilderSource,
    /getAPIProvider\(\) === 'firstParty'/,
  )
})

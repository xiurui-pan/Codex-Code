import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

globalThis.MACRO ??= {
  VERSION: '0.0.0-test',
}

function withEnv(overrides, fn) {
  const previous = new Map()
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of previous.entries()) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    })
}

test('codex config centralizes base URL, model, reasoning, storage, and auth', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-config-'))
  const codexDir = join(tempDir, '.codex')
  const configPath = join(codexDir, 'config.toml')
  await mkdir(codexDir, { recursive: true })
  await writeFile(
    configPath,
    [
      'model_provider = "test-provider"',
      'model = "gpt-5.1-codex-mini"',
      'model_reasoning_effort = "high"',
      'response_storage = false',
      '',
      '[model_providers.test-provider]',
      'base_url = "https://example.invalid/v1"',
      'env_key = "TEST_CODEX_API_KEY"',
      '',
    ].join('\n'),
  )

  try {
    await withEnv(
      {
        TEST_CODEX_API_KEY: 'test-key',
        ANTHROPIC_BASE_URL: undefined,
        ANTHROPIC_MODEL: undefined,
        ANTHROPIC_API_KEY: undefined,
        CLAUDE_CODE_EFFORT_LEVEL: undefined,
        CLAUDE_CODE_CODEX_RESPONSE_STORAGE: undefined,
        CLAUDE_CODE_CODEX_ENV_KEY: undefined,
      },
      async () => {
        const {
          applyCodexConfigToEnv,
          getCodexConfiguredApiKey,
          getCodexConfiguredAuthEnvKey,
          getCodexConfiguredBaseUrl,
          getCodexConfiguredModel,
          getCodexConfiguredReasoningEffort,
          getCodexConfiguredResponseStorage,
          loadCodexConfig,
        } = await import('../src/utils/codexConfig.ts')

        const config = await loadCodexConfig(configPath)
        assert.equal(config.baseUrl, 'https://example.invalid/v1')
        assert.equal(config.model, 'gpt-5.1-codex-mini')
        assert.equal(config.reasoningEffort, 'high')
        assert.equal(config.responseStorage, false)
        assert.equal(config.apiKeyEnvName, 'TEST_CODEX_API_KEY')
        assert.equal(config.apiKey, 'test-key')

        applyCodexConfigToEnv(config)

        assert.equal(getCodexConfiguredBaseUrl(), 'https://example.invalid/v1')
        assert.equal(getCodexConfiguredModel(), 'gpt-5.1-codex-mini')
        assert.equal(getCodexConfiguredReasoningEffort(), 'high')
        assert.equal(getCodexConfiguredResponseStorage(), false)
        assert.equal(getCodexConfiguredAuthEnvKey(), 'TEST_CODEX_API_KEY')
        assert.equal(getCodexConfiguredApiKey(), 'test-key')
      },
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('disable_response_storage stays compatible and only applies when response_storage is absent', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-config-compat-'))
  const codexDir = join(tempDir, '.codex')
  const configPath = join(codexDir, 'config.toml')
  await mkdir(codexDir, { recursive: true })

  try {
    await writeFile(
      configPath,
      [
        'model_provider = "test-provider"',
        'disable_response_storage = true',
        '',
        '[model_providers.test-provider]',
        'base_url = "https://example.invalid/v1"',
        '',
      ].join('\n'),
    )

    const { loadCodexConfig } = await import('../src/utils/codexConfig.ts')
    const compatConfig = await loadCodexConfig(configPath)
    assert.equal(compatConfig.responseStorage, false)

    await writeFile(
      configPath,
      [
        'model_provider = "test-provider"',
        'response_storage = true',
        'disable_response_storage = true',
        '',
        '[model_providers.test-provider]',
        'base_url = "https://example.invalid/v1"',
        '',
      ].join('\n'),
    )

    const explicitConfig = await loadCodexConfig(configPath)
    assert.equal(explicitConfig.responseStorage, true)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

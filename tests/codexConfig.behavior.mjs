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
      'small_fast_model = "gpt-5.4-mini"',
      'model_reasoning_effort = "high"',
      'model_reasoning_summary = "none"',
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
        CODEX_CODE_EFFORT_LEVEL: undefined,
        CODEX_CODE_DEFAULT_REASONING_EFFORT: undefined,
        CODEX_CODE_CODEX_RESPONSE_STORAGE: undefined,
        CODEX_CODE_CODEX_ENV_KEY: undefined,
      },
      async () => {
        const {
          applyCodexConfigToEnv,
          getCodexConfiguredApiKey,
          getCodexConfiguredAuthEnvKey,
          getCodexConfiguredBaseUrl,
          getCodexConfiguredModel,
          getCodexConfiguredReasoningSummary,
          getCodexConfiguredSmallFastModel,
          getCodexConfiguredReasoningEffort,
          getCodexConfiguredResponseStorage,
          loadCodexConfig,
        } = await import('../src/utils/codexConfig.ts')

        const config = await loadCodexConfig(configPath)
        assert.equal(config.baseUrl, 'https://example.invalid/v1')
        assert.equal(config.model, 'gpt-5.1-codex-mini')
        assert.equal(config.smallFastModel, 'gpt-5.4-mini')
        assert.equal(config.reasoningEffort, 'high')
        assert.equal(config.reasoningSummary, 'none')
        assert.equal(config.responseStorage, false)
        assert.equal(config.modelContextWindow, undefined)
        assert.equal(config.modelAutoCompactTokenLimit, undefined)
        assert.equal(config.apiKeyEnvName, 'TEST_CODEX_API_KEY')
        assert.equal(config.apiKey, 'test-key')

        applyCodexConfigToEnv(config)

        assert.equal(getCodexConfiguredBaseUrl(), 'https://example.invalid/v1')
        assert.equal(getCodexConfiguredModel(), 'gpt-5.1-codex-mini')
        assert.equal(getCodexConfiguredSmallFastModel(), 'gpt-5.4-mini')
        assert.equal(getCodexConfiguredReasoningEffort(), 'high')
        assert.equal(getCodexConfiguredReasoningSummary(), 'none')
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

test('codex config exposes reasoning effort as a default instead of a hard override', async () => {
  await withEnv(
    {
      CODEX_CODE_EFFORT_LEVEL: undefined,
      CODEX_CODE_DEFAULT_REASONING_EFFORT: 'medium',
    },
    async () => {
      const { getCodexConfiguredReasoningEffort } = await import(
        '../src/utils/codexConfig.ts'
      )
      assert.equal(getCodexConfiguredReasoningEffort(), 'medium')
    },
  )
})

test('codex config exposes reasoning summary as a default instead of a hard override', async () => {
  await withEnv(
    {
      CODEX_CODE_DEFAULT_REASONING_SUMMARY: 'none',
    },
    async () => {
      const { getCodexConfiguredReasoningSummary } = await import(
        '../src/utils/codexConfig.ts'
      )
      assert.equal(getCodexConfiguredReasoningSummary(), 'none')
    },
  )
})

test('codex config exposes context window and auto compact limits through env helpers', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-config-window-'))
  const codexDir = join(tempDir, '.codex')
  const configPath = join(codexDir, 'config.toml')
  await mkdir(codexDir, { recursive: true })
  await writeFile(
    configPath,
    [
      'model_provider = "test-provider"',
      'model_context_window = 400000',
      'model_auto_compact_token_limit = 310000',
      '',
      '[model_providers.test-provider]',
      'base_url = "https://example.invalid/v1"',
      '',
    ].join('\n'),
  )

  try {
    await withEnv(
      {
        CODEX_CODE_MODEL_CONTEXT_WINDOW: undefined,
        CODEX_CODE_MODEL_AUTO_COMPACT_TOKEN_LIMIT: undefined,
      },
      async () => {
        const {
          applyCodexConfigToEnv,
          getCodexAutoCompactTokenLimit,
          getCodexConfiguredAutoCompactTokenLimit,
          getCodexConfiguredModelContextWindow,
          getCodexEffectiveContextWindow,
          loadCodexConfig,
        } = await import('../src/utils/codexConfig.ts')

        const config = await loadCodexConfig(configPath)
        assert.equal(config.modelContextWindow, 400000)
        assert.equal(config.modelAutoCompactTokenLimit, 310000)

        applyCodexConfigToEnv(config)

        assert.equal(getCodexConfiguredModelContextWindow(), 400000)
        assert.equal(getCodexConfiguredAutoCompactTokenLimit(), 310000)
        assert.equal(getCodexEffectiveContextWindow(), 380000)
        assert.equal(getCodexAutoCompactTokenLimit(), 310000)
      },
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('codex config can update model_context_window in ~/.codex/config.toml', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-config-write-'))
  const codexDir = join(tempDir, '.codex')
  const configPath = join(codexDir, 'config.toml')
  await mkdir(codexDir, { recursive: true })
  await writeFile(
    configPath,
    [
      'model_provider = "test-provider"',
      '',
      '[model_providers.test-provider]',
      'base_url = "https://example.invalid/v1"',
      '',
    ].join('\n'),
  )

  try {
    const {
      loadCodexConfig,
      writeCodexConfigModelContextWindow,
    } = await import('../src/utils/codexConfig.ts')

    await writeCodexConfigModelContextWindow(400000, configPath)
    let config = await loadCodexConfig(configPath)
    assert.equal(config.modelContextWindow, 400000)

    await writeCodexConfigModelContextWindow(undefined, configPath)
    config = await loadCodexConfig(configPath)
    assert.equal(config.modelContextWindow, undefined)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('codex config can update model_reasoning_summary in ~/.codex/config.toml', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-config-summary-write-'))
  const codexDir = join(tempDir, '.codex')
  const configPath = join(codexDir, 'config.toml')
  await mkdir(codexDir, { recursive: true })
  await writeFile(
    configPath,
    [
      'model_provider = "test-provider"',
      '',
      '[model_providers.test-provider]',
      'base_url = "https://example.invalid/v1"',
      '',
    ].join('\n'),
  )

  try {
    const {
      loadCodexConfig,
      writeCodexConfigModelReasoningSummary,
    } = await import('../src/utils/codexConfig.ts')

    await writeCodexConfigModelReasoningSummary('none', configPath)
    let config = await loadCodexConfig(configPath)
    assert.equal(config.reasoningSummary, 'none')

    await writeCodexConfigModelReasoningSummary(undefined, configPath)
    config = await loadCodexConfig(configPath)
    assert.equal(config.reasoningSummary, undefined)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('codex config exposes provider retry and stream timeout settings', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-config-retry-'))
  const codexDir = join(tempDir, '.codex')
  const configPath = join(codexDir, 'config.toml')
  await mkdir(codexDir, { recursive: true })
  await writeFile(
    configPath,
    [
      'model_provider = "test-provider"',
      '',
      '[model_providers.test-provider]',
      'base_url = "https://example.invalid/v1"',
      'request_max_retries = 7',
      'stream_max_retries = 9',
      'stream_idle_timeout_ms = 450000',
      '',
    ].join('\n'),
  )

  try {
    await withEnv(
      {
        CODEX_CODE_REQUEST_MAX_RETRIES: undefined,
        CODEX_CODE_STREAM_MAX_RETRIES: undefined,
        CODEX_CODE_STREAM_IDLE_TIMEOUT_MS: undefined,
      },
      async () => {
        const {
          applyCodexConfigToEnv,
          getCodexRequestMaxRetries,
          getCodexStreamIdleTimeoutMs,
          getCodexStreamMaxRetries,
          loadCodexConfig,
        } = await import('../src/utils/codexConfig.ts')

        const config = await loadCodexConfig(configPath)
        assert.equal(config.requestMaxRetries, 7)
        assert.equal(config.streamMaxRetries, 9)
        assert.equal(config.streamIdleTimeoutMs, 450000)

        applyCodexConfigToEnv(config)

        assert.equal(getCodexRequestMaxRetries(), 7)
        assert.equal(getCodexStreamMaxRetries(), 9)
        assert.equal(getCodexStreamIdleTimeoutMs(), 450000)
      },
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

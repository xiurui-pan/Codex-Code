import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  createAssistantMessageFromPreferredAssistantResponsePayload,
} from '../src/services/api/assistantEnvelope.js'
import {
  createCodexPublicModelInfo,
  DEFAULT_CODEX_MODEL,
  getCodexSupportedEffortLevels,
  resolveCodexModelInput,
} from '../src/utils/model/codexModels.js'
import { preferredTurnResultToPayload } from '../src/services/api/preferredAssistantResponse.js'

async function readModelSource(): Promise<string> {
  const modelPath = fileURLToPath(
    new URL('../src/services/api/model.ts', import.meta.url),
  )
  return readFile(modelPath, 'utf8')
}

async function readModelUtilitySource(): Promise<string> {
  const modelPath = fileURLToPath(
    new URL('../src/utils/model/model.ts', import.meta.url),
  )
  return readFile(modelPath, 'utf8')
}

async function readSource(relativePath: string): Promise<string> {
  const sourcePath = fileURLToPath(new URL(relativePath, import.meta.url))
  return readFile(sourcePath, 'utf8')
}

async function readCodexResponsesSource(): Promise<string> {
  const sourcePath = fileURLToPath(
    new URL('../src/services/api/codexResponses.ts', import.meta.url),
  )
  return readFile(sourcePath, 'utf8')
}

function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>()
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

test('model entry no longer imports claude facade or ANTHROPIC_MODEL', async () => {
  const source = await readModelSource()

  assert.equal(source.includes("'./claude.js'"), false)
  assert.equal(source.includes('ANTHROPIC_MODEL'), false)
})

test('codex small-model helpers route UI side tasks through the lightweight Codex tier', async () => {
  const modelSource = await readModelSource()
  const modelUtilitySource = await readModelUtilitySource()
  const guideAgentSource = await readSource(
    '../src/tools/AgentTool/built-in/claudeCodeGuideAgent.ts',
  )
  const exploreAgentSource = await readSource(
    '../src/tools/AgentTool/built-in/exploreAgent.ts',
  )
  const statuslineAgentSource = await readSource(
    '../src/tools/AgentTool/built-in/statuslineSetup.ts',
  )
  const magicDocsSource = await readSource(
    '../src/services/MagicDocs/magicDocs.ts',
  )

  assert.match(
    modelUtilitySource,
    /configuredSmallFastModel[\s\S]*isCurrentPhaseCustomCodexProvider\(\)[\s\S]*resolveCodexModelInput\(configuredSmallFastModel \?\? 'gpt-5\.4-mini'\)/,
  )
  assert.match(modelSource, /model: args\.options\?\.model \?\? getSmallFastModel\(\)/)
  assert.match(guideAgentSource, /model: 'haiku'/)
  assert.match(exploreAgentSource, /process\.env\.USER_TYPE === 'ant'[\s\S]*: 'haiku'/)
  assert.match(statuslineAgentSource, /model: 'haiku'/)
  assert.match(magicDocsSource, /model: 'haiku'/)
})

test('custom provider helper agents resolve haiku through small_fast_model', async () => {
  await withEnv(
    {
      CODEX_CODE_USE_CODEX_PROVIDER: '1',
      CODEX_CODE_SMALL_FAST_MODEL: 'gpt-5.1-codex-mini',
      ANTHROPIC_SMALL_FAST_MODEL: undefined,
    },
    async () => {
      const { getSmallFastModel } = await import('../src/utils/model/model.ts')
      const { getAgentModel } = await import('../src/utils/model/agent.ts')

      assert.equal(getSmallFastModel(), 'gpt-5.1-codex-mini')
      assert.equal(getAgentModel('haiku', 'gpt-5.4'), 'gpt-5.1-codex-mini')
    },
  )
})

test('custom provider opus 1m merge gate exits before touching claude auth state', async () => {
  await withEnv(
    {
      CODEX_CODE_USE_CODEX_PROVIDER: '1',
    },
    async () => {
      const { isOpus1mMergeEnabled } = await import('../src/utils/model/model.ts')

      assert.equal(isOpus1mMergeEnabled(), false)
    },
  )
})

test('preferred response conversion keeps payload first and only wraps at the outer assistant edge', () => {
  const payload = preferredTurnResultToPayload({
    kind: 'preferred_content',
    preferred: {
      kind: 'text',
      text: 'payload text',
      renderableItems: [
        {
          kind: 'final_answer',
          provider: 'custom',
          text: 'payload text',
          source: 'message_output',
        },
      ],
    },
  })

  assert.equal(payload.kind, 'synthetic_payload')
  assert.equal(payload.payload.content[0]?.type, 'text')
  assert.equal(payload.payload.content[0]?.text, 'payload text')
  assert.equal('message' in payload, false)

  const assistantMessage =
    createAssistantMessageFromPreferredAssistantResponsePayload(payload)
  assert.equal(assistantMessage.message.content[0]?.type, 'text')
  assert.equal(assistantMessage.message.content[0]?.text, 'payload text')
})

test('preferred response conversion keeps api_error on the payload side until wrapping', () => {
  const payload = preferredTurnResultToPayload({
    kind: 'api_error',
    errorMessage: 'boom',
  })

  assert.deepEqual(payload, {
    kind: 'api_error',
    errorMessage: 'boom',
  })

  const assistantMessage =
    createAssistantMessageFromPreferredAssistantResponsePayload(payload)
  assert.equal(assistantMessage.isApiErrorMessage, true)
  assert.equal(assistantMessage.message.content[0]?.type, 'text')
  assert.equal(assistantMessage.message.content[0]?.text, 'boom')
})


test('codex model capability table resolves aliases and supported reasoning levels', () => {
  assert.equal(DEFAULT_CODEX_MODEL, 'gpt-5.4')
  assert.equal(resolveCodexModelInput('mini'), 'gpt-5.4-mini')
  assert.equal(resolveCodexModelInput('haiku'), 'gpt-5.4-mini')
  assert.equal(resolveCodexModelInput('sonnet'), 'gpt-5.4')
  assert.equal(resolveCodexModelInput('opus'), 'gpt-5.3-codex')
  assert.equal(resolveCodexModelInput('opusplan'), 'gpt-5.3-codex')
  assert.deepEqual(getCodexSupportedEffortLevels('gpt-5.4-mini'), [
    'low',
    'medium',
    'high',
    'xhigh',
  ])
  assert.deepEqual(getCodexSupportedEffortLevels('gpt-5.4'), [
    'low',
    'medium',
    'high',
    'xhigh',
  ])
  assert.deepEqual(getCodexSupportedEffortLevels('gpt-5.3-codex'), [
    'low',
    'medium',
    'high',
    'xhigh',
  ])
})


test('unknown custom codex models use the same public reasoning shape everywhere', () => {
  const publicInfo = createCodexPublicModelInfo({
    value: 'gpt-5.1-codex-enterprise',
  })

  assert.deepEqual(publicInfo, {
    value: 'gpt-5.1-codex-enterprise',
    displayName: 'gpt-5.1-codex-enterprise',
    description: 'Custom Codex model',
    defaultEffortLevel: 'medium',
    supportedEffortLevels: ['medium'],
  })
})


test('default public model info keeps a distinct default id while using default model reasoning', () => {
  const publicInfo = createCodexPublicModelInfo({
    value: 'gpt-5.4',
    publicValue: 'default',
    displayName: 'Default (recommended)',
    description: 'Use the default Codex model',
  })

  assert.deepEqual(publicInfo, {
    value: 'default',
    displayName: 'Default (recommended)',
    description: 'Use the default Codex model',
    defaultEffortLevel: 'medium',
    supportedEffortLevels: ['low', 'medium', 'high', 'xhigh'],
  })
})

test('codex responses entry now returns raw turn-item chunks and leaves assistant-shell compatibility to outer layers', async () => {
  const source = await readCodexResponsesSource()

  assert.equal(source.includes("kind: 'turn_items'"), true)
  assert.equal(source.includes('mergeStreamedAssistantMessages'), false)
  assert.equal(source.includes('codex-synthetic'), false)
})

test('codex streaming model adapter ignores reconnect progress chunks', async () => {
  const source = await readModelSource()

  assert.match(source, /chunk\.kind === 'retry'/)
})

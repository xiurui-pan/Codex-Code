import type {
  BetaJSONOutputFormat,
  BetaMessageStreamParams,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { feature } from 'bun:bundle'
import {
  AFK_MODE_BETA_HEADER,
  CONTEXT_1M_BETA_HEADER,
  CONTEXT_MANAGEMENT_BETA_HEADER,
  FAST_MODE_BETA_HEADER,
  REDACT_THINKING_BETA_HEADER,
  STRUCTURED_OUTPUTS_BETA_HEADER,
} from 'src/constants/betas.js'
import type { QuerySource } from 'src/constants/querySource.js'
import { getAPIContextManagement } from 'src/services/compact/apiMicrocompact.js'
import { getBedrockExtraBodyParamsBetas } from 'src/utils/betas.js'
import { getMaxThinkingTokensForModel } from 'src/utils/context.js'
import { logForDebugging } from 'src/utils/debug.js'
import { isEnvTruthy } from 'src/utils/envUtils.js'
import {
  isFastModeAvailable,
  isFastModeCooldown,
  isFastModeEnabled,
  isFastModeSupportedByModel,
} from 'src/utils/fastMode.js'
import {
  modelSupportsAdaptiveThinking,
  modelSupportsThinking,
  type ThinkingConfig,
} from 'src/utils/thinking.js'
import type { RetryContext } from './withRetry.js'
import { normalizeModelStringForAPI } from '../../utils/model/model.js'
import {
  getAPIProvider,
  shouldUseAnthropicFirstPartyApiFeatures,
} from '../../utils/model/providers.js'
import { getSonnet1mExpTreatmentEnabled } from '../../utils/context.js'
import { modelSupportsStructuredOutputs, shouldIncludeFirstPartyOnlyBetas } from '../../utils/betas.js'
import { getModelMaxOutputTokens } from './model.js'
import { addCacheBreakpoints } from './requestPromptAssembly.js'
import {
  configureRequestTaskBudgetParams,
  getRequestExtraBodyParams,
  getRequestMetadata,
  getRequestPromptCachingEnabled,
} from './requestConfig.js'

type CachedMCEditsBlock = {
  type: 'cache_edits'
  edits: { type: 'delete'; cache_reference: string }[]
}

type CachedMCPinnedEdits = {
  userMessageIndex: number
  block: CachedMCEditsBlock
}

type TaskBudgetParam = {
  type: 'tokens'
  total: number
  remaining?: number
}

type EffortValue = string | number | undefined

type QueryOptionsLike = {
  model: string
  toolChoice?: BetaMessageStreamParams['tool_choice']
  maxOutputTokensOverride?: number
  querySource: QuerySource
  skipCacheWrite?: boolean
  taskBudget?: { total: number; remaining?: number }
  outputFormat?: BetaJSONOutputFormat
  temperatureOverride?: number
  enablePromptCaching?: boolean
}

type ConfigureEffortParams = (
  effortValue: EffortValue,
  outputConfig: BetaMessageStreamParams['output_config'] & {
    task_budget?: TaskBudgetParam
  },
  extraBodyParams: Record<string, unknown>,
  betas: string[],
  model: string,
) => void

export type RequestParamsBuilderContext = {
  options: QueryOptionsLike
  betas: string[]
  messagesForAPI: Parameters<typeof addCacheBreakpoints>[0]
  system: BetaMessageStreamParams['system']
  allTools: BetaMessageStreamParams['tools']
  thinkingConfig: ThinkingConfig
  useBetas: boolean
  toolSearchHeader: string | null
  effort: EffortValue
  thinkingClearLatched: boolean
  cacheEditingHeaderLatched: boolean
  cacheEditingBetaHeader: string
  cachedMCEnabled: boolean
  afkHeaderLatched: boolean
  isAgenticQuery: boolean
  consumedCacheEdits: CachedMCEditsBlock | null
  consumedPinnedEdits: CachedMCPinnedEdits[]
  isFastMode: boolean
  fastModeHeaderLatched: boolean
  configureEffortParams: ConfigureEffortParams
}

export type RequestParamsBuilderResult = {
  params: BetaMessageStreamParams
  lastRequestBetas: string[]
}

export function buildRequestParamsFromContext(
  retryContext: RetryContext,
  context: RequestParamsBuilderContext,
): RequestParamsBuilderResult {
  const betasParams = [...context.betas]

  if (
    !betasParams.includes(CONTEXT_1M_BETA_HEADER) &&
    getSonnet1mExpTreatmentEnabled(retryContext.model)
  ) {
    betasParams.push(CONTEXT_1M_BETA_HEADER)
  }

  const bedrockBetas =
    getAPIProvider() === 'bedrock'
      ? [
          ...getBedrockExtraBodyParamsBetas(retryContext.model),
          ...(context.toolSearchHeader ? [context.toolSearchHeader] : []),
        ]
      : []
  const extraBodyParams = getRequestExtraBodyParams(bedrockBetas)

  const outputConfig: BetaMessageStreamParams['output_config'] = {
    ...((extraBodyParams.output_config as BetaMessageStreamParams['output_config']) ??
      {}),
  }

  context.configureEffortParams(
    context.effort,
    outputConfig as BetaMessageStreamParams['output_config'] & {
      task_budget?: TaskBudgetParam
    },
    extraBodyParams,
    betasParams,
    context.options.model,
  )

  configureRequestTaskBudgetParams(
    context.options.taskBudget,
    outputConfig as BetaMessageStreamParams['output_config'] & {
      task_budget?: TaskBudgetParam
    },
    betasParams,
  )

  if (context.options.outputFormat && !('format' in outputConfig)) {
    outputConfig.format =
      context.options.outputFormat as BetaJSONOutputFormat
    if (
      modelSupportsStructuredOutputs(context.options.model) &&
      !betasParams.includes(STRUCTURED_OUTPUTS_BETA_HEADER)
    ) {
      betasParams.push(STRUCTURED_OUTPUTS_BETA_HEADER)
    }
  }

  const maxOutputTokens =
    retryContext?.maxTokensOverride ||
    context.options.maxOutputTokensOverride ||
    getModelMaxOutputTokens(context.options.model)

  const hasThinking =
    context.thinkingConfig.type !== 'disabled' &&
    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_THINKING)
  let thinking: BetaMessageStreamParams['thinking'] | undefined = undefined

  if (hasThinking && modelSupportsThinking(context.options.model)) {
    if (
      !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING) &&
      modelSupportsAdaptiveThinking(context.options.model)
    ) {
      thinking = {
        type: 'adaptive',
      } satisfies BetaMessageStreamParams['thinking']
    } else {
      let thinkingBudget = getMaxThinkingTokensForModel(context.options.model)
      if (
        context.thinkingConfig.type === 'enabled' &&
        context.thinkingConfig.budgetTokens !== undefined
      ) {
        thinkingBudget = context.thinkingConfig.budgetTokens
      }
      thinkingBudget = Math.min(maxOutputTokens - 1, thinkingBudget)
      thinking = {
        budget_tokens: thinkingBudget,
        type: 'enabled',
      } satisfies BetaMessageStreamParams['thinking']
    }
  }

  const contextManagement = getAPIContextManagement({
    hasThinking,
    isRedactThinkingActive: betasParams.includes(REDACT_THINKING_BETA_HEADER),
    clearAllThinking: context.thinkingClearLatched,
  })

  const enablePromptCaching =
    context.options.enablePromptCaching ??
    getRequestPromptCachingEnabled(retryContext.model)

  let speed: BetaMessageStreamParams['speed']
  const isFastModeForRetry =
    isFastModeEnabled() &&
    isFastModeAvailable() &&
    !isFastModeCooldown() &&
    isFastModeSupportedByModel(context.options.model) &&
    !!retryContext.fastMode
  if (isFastModeForRetry) {
    speed = 'fast'
  }
  if (
    context.fastModeHeaderLatched &&
    !betasParams.includes(FAST_MODE_BETA_HEADER)
  ) {
    betasParams.push(FAST_MODE_BETA_HEADER)
  }

  if (feature('TRANSCRIPT_CLASSIFIER')) {
    if (
      context.afkHeaderLatched &&
      shouldIncludeFirstPartyOnlyBetas() &&
      context.isAgenticQuery &&
      !betasParams.includes(AFK_MODE_BETA_HEADER)
    ) {
      betasParams.push(AFK_MODE_BETA_HEADER)
    }
  }

  const useCachedMC =
    context.cachedMCEnabled &&
    shouldUseAnthropicFirstPartyApiFeatures() &&
    context.options.querySource === 'repl_main_thread'
  if (
    context.cacheEditingHeaderLatched &&
    shouldUseAnthropicFirstPartyApiFeatures() &&
    context.options.querySource === 'repl_main_thread' &&
    !betasParams.includes(context.cacheEditingBetaHeader)
  ) {
    betasParams.push(context.cacheEditingBetaHeader)
    logForDebugging(
      'Cache editing beta header enabled for cached microcompact',
    )
  }

  const temperature = !hasThinking
    ? (context.options.temperatureOverride ?? 1)
    : undefined

  return {
    params: {
      model: normalizeModelStringForAPI(context.options.model),
      messages: addCacheBreakpoints(
        context.messagesForAPI,
        enablePromptCaching,
        context.options.querySource,
        useCachedMC,
        context.consumedCacheEdits,
        context.consumedPinnedEdits,
        context.options.skipCacheWrite,
      ),
      system: context.system,
      tools: context.allTools,
      tool_choice: context.options.toolChoice,
      ...(context.useBetas && { betas: betasParams }),
      metadata: getRequestMetadata(),
      max_tokens: maxOutputTokens,
      thinking,
      ...(temperature !== undefined && { temperature }),
      ...(contextManagement &&
        context.useBetas &&
        betasParams.includes(CONTEXT_MANAGEMENT_BETA_HEADER) && {
          context_management: contextManagement,
        }),
      ...extraBodyParams,
      ...(Object.keys(outputConfig).length > 0 && {
        output_config: outputConfig,
      }),
      ...(speed !== undefined && { speed }),
    },
    lastRequestBetas: betasParams,
  }
}

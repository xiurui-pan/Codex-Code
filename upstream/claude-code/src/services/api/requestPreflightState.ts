import { feature } from 'bun:bundle'
import {
  getAfkModeHeaderLatched,
  getCacheEditingHeaderLatched,
  getFastModeHeaderLatched,
  getLastApiCompletionTimestamp,
  getThinkingClearLatched,
  setAfkModeHeaderLatched,
  setCacheEditingHeaderLatched,
  setFastModeHeaderLatched,
  setThinkingClearLatched,
} from 'src/bootstrap/state.js'
import { currentLimits } from 'src/services/claudeAiLimits.js'
import { shouldIncludeFirstPartyOnlyBetas } from 'src/utils/betas.js'
import { resolveAppliedEffort } from 'src/utils/effort.js'
import {
  isFastModeAvailable,
  isFastModeCooldown,
  isFastModeEnabled,
  isFastModeSupportedByModel,
} from 'src/utils/fastMode.js'
import { getAPIProvider } from 'src/utils/model/providers.js'
import { jsonStringify } from 'src/utils/slowOperations.js'
import {
  isBetaTracingEnabled,
  type LLMRequestNewContext,
  startLLMRequestSpan,
} from 'src/utils/telemetry/sessionTracing.js'
import { consumePendingCacheEdits, getPinnedCacheEdits } from '../compact/microCompact.js'
import { CACHE_TTL_1HOUR_MS, recordPromptState } from './promptCacheBreakDetection.js'
import type { GlobalCacheStrategy } from './logging.js'
import { getRequestExtraBodyParams } from './requestConfig.js'

type CachedMCEditsBlock = {
  type: 'cache_edits'
  edits: { type: 'delete'; cache_reference: string }[]
}

type CachedMCPinnedEdits = ReturnType<typeof getPinnedCacheEdits>

type QueryOptionsLike = {
  model: string
  querySource: string
  agentId?: string
  fastMode?: boolean
  effortValue?: Parameters<typeof resolveAppliedEffort>[1]
}

type AutoModeStateModuleLike = {
  isAutoModeActive?: () => boolean
} | null

export type RequestPreflightContext = {
  options: QueryOptionsLike
  isAgenticQuery: boolean
  cachedMCEnabled: boolean
  globalCacheStrategy: GlobalCacheStrategy
  betas: string[]
  system: unknown
  allTools: Array<{ defer_loading?: boolean }>
  systemPrompt: string[]
  messagesForAPI: unknown[]
  autoModeStateModule?: AutoModeStateModuleLike
}

export type RequestPreflightState = {
  isFastMode: boolean
  afkHeaderLatched: boolean
  fastModeHeaderLatched: boolean
  cacheEditingHeaderLatched: boolean
  thinkingClearLatched: boolean
  effort: ReturnType<typeof resolveAppliedEffort>
  newContext: LLMRequestNewContext | undefined
  llmSpan: ReturnType<typeof startLLMRequestSpan>
  consumedCacheEdits: CachedMCEditsBlock | null
  consumedPinnedEdits: CachedMCPinnedEdits
  lastRequestBetas: string[] | undefined
}

export function buildRequestPreflightState(
  context: RequestPreflightContext,
): RequestPreflightState {
  const isFastMode =
    isFastModeEnabled() &&
    isFastModeAvailable() &&
    !isFastModeCooldown() &&
    isFastModeSupportedByModel(context.options.model) &&
    !!context.options.fastMode

  let afkHeaderLatched = getAfkModeHeaderLatched() === true
  if (feature('TRANSCRIPT_CLASSIFIER')) {
    if (
      !afkHeaderLatched &&
      context.isAgenticQuery &&
      shouldIncludeFirstPartyOnlyBetas() &&
      (context.autoModeStateModule?.isAutoModeActive?.() ?? false)
    ) {
      afkHeaderLatched = true
      setAfkModeHeaderLatched(true)
    }
  }

  let fastModeHeaderLatched = getFastModeHeaderLatched() === true
  if (!fastModeHeaderLatched && isFastMode) {
    fastModeHeaderLatched = true
    setFastModeHeaderLatched(true)
  }

  let cacheEditingHeaderLatched = getCacheEditingHeaderLatched() === true
  if (feature('CACHED_MICROCOMPACT')) {
    if (
      !cacheEditingHeaderLatched &&
      context.cachedMCEnabled &&
      getAPIProvider() === 'firstParty' &&
      context.options.querySource === 'repl_main_thread'
    ) {
      cacheEditingHeaderLatched = true
      setCacheEditingHeaderLatched(true)
    }
  }

  let thinkingClearLatched = getThinkingClearLatched() === true
  if (!thinkingClearLatched && context.isAgenticQuery) {
    const lastCompletion = getLastApiCompletionTimestamp()
    if (
      lastCompletion !== null &&
      Date.now() - lastCompletion > CACHE_TTL_1HOUR_MS
    ) {
      thinkingClearLatched = true
      setThinkingClearLatched(true)
    }
  }

  const effort = resolveAppliedEffort(
    context.options.model,
    context.options.effortValue,
  )

  if (feature('PROMPT_CACHE_BREAK_DETECTION')) {
    const toolsForCacheDetection = context.allTools.filter(
      t => !('defer_loading' in t && t.defer_loading),
    )
    recordPromptState({
      system: context.system,
      toolSchemas: toolsForCacheDetection,
      querySource: context.options.querySource,
      model: context.options.model,
      agentId: context.options.agentId,
      fastMode: fastModeHeaderLatched,
      globalCacheStrategy: context.globalCacheStrategy,
      betas: context.betas,
      autoModeActive: afkHeaderLatched,
      isUsingOverage: currentLimits.isUsingOverage ?? false,
      cachedMCEnabled: cacheEditingHeaderLatched,
      effortValue: effort,
      extraBodyParams: getRequestExtraBodyParams(),
    })
  }

  const newContext: LLMRequestNewContext | undefined = isBetaTracingEnabled()
    ? {
        systemPrompt: context.systemPrompt.join('\n\n'),
        querySource: context.options.querySource,
        tools: jsonStringify(context.allTools),
      }
    : undefined

  const llmSpan = startLLMRequestSpan(
    context.options.model,
    newContext,
    context.messagesForAPI,
    isFastMode,
  )

  const consumedCacheEdits = context.cachedMCEnabled
    ? (consumePendingCacheEdits() as CachedMCEditsBlock | null)
    : null
  const consumedPinnedEdits = context.cachedMCEnabled ? getPinnedCacheEdits() : []

  let lastRequestBetas: string[] | undefined

  return {
    isFastMode,
    afkHeaderLatched,
    fastModeHeaderLatched,
    cacheEditingHeaderLatched,
    thinkingClearLatched,
    effort,
    newContext,
    llmSpan,
    consumedCacheEdits,
    consumedPinnedEdits,
    lastRequestBetas,
  }
}

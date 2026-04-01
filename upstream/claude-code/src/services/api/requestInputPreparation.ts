import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import {
  getAttributionHeader,
  getCLISyspromptPrefix,
} from '../../constants/system.js'
import type { Tools } from '../../Tool.js'
import type { Message } from '../../types/message.js'
import { logAPIPrefix } from '../../utils/api.js'
import { computeFingerprintFromMessages } from '../../utils/fingerprint.js'
import {
  createUserMessage,
  ensureToolResultPairing,
  normalizeMessagesForAPI,
  stripAdvisorBlocks,
  stripCallerFieldFromAssistantMessage,
  stripToolReferenceBlocksFromUserMessage,
} from '../../utils/messages.js'
import {
  asSystemPrompt,
  type SystemPrompt,
} from '../../utils/systemPromptType.js'
import { API_MAX_MEDIA_PER_REQUEST } from '../../constants/apiLimits.js'
import { ADVISOR_BETA_HEADER } from '../../constants/betas.js'
import {
  formatDeferredToolLine,
} from '../../tools/ToolSearchTool/prompt.js'
import type { QuerySource } from 'src/constants/querySource.js'
import {
  ADVISOR_TOOL_INSTRUCTIONS,
} from 'src/utils/advisor.js'
import { CLAUDE_IN_CHROME_MCP_SERVER_NAME } from 'src/utils/claudeInChrome/common.js'
import { CHROME_TOOL_SEARCH_INSTRUCTIONS } from 'src/utils/claudeInChrome/prompt.js'
import { isMcpInstructionsDeltaEnabled } from 'src/utils/mcpInstructionsDelta.js'
import { queryCheckpoint } from 'src/utils/queryProfiler.js'
import {
  isDeferredToolsDeltaEnabled,
} from 'src/utils/toolSearch.js'
import { logEvent } from '../analytics/index.js'
import { isToolFromMcpServer } from '../mcp/utils.js'
import { getRequestPromptCachingEnabled } from './requestConfig.js'
import {
  buildSystemPromptBlocks,
  stripExcessMediaItems,
} from './requestPromptAssembly.js'

type RequestInputPreparationOptions = {
  model: string
  isNonInteractiveSession: boolean
  hasAppendSystemPrompt: boolean
  enablePromptCaching?: boolean
  querySource: QuerySource
  extraToolSchemas?: BetaToolUnion[]
}

export type RequestInputPreparationContext = {
  messages: Message[]
  systemPrompt: SystemPrompt
  tools: Tools
  filteredTools: Tools
  toolSchemas: BetaToolUnion[]
  options: RequestInputPreparationOptions
  betas: string[]
  useToolSearch: boolean
  deferredToolNames: Set<string>
  advisorModel?: string
  needsToolBasedCacheMarker: boolean
}

export type RequestInputPreparationResult = {
  messagesForAPI: ReturnType<typeof normalizeMessagesForAPI>
  fingerprint: ReturnType<typeof computeFingerprintFromMessages>
  systemPrompt: SystemPrompt
  system: ReturnType<typeof buildSystemPromptBlocks>
  useBetas: boolean
  allTools: BetaToolUnion[]
}

export function prepareRequestInput(
  context: RequestInputPreparationContext,
): RequestInputPreparationResult {
  let {
    systemPrompt,
  } = context

  // Normalize messages before building system prompt (needed for fingerprinting)
  // Instrumentation: Track message count before normalization
  logEvent('tengu_api_before_normalize', {
    preNormalizedMessageCount: context.messages.length,
  })

  queryCheckpoint('query_message_normalization_start')
  let messagesForAPI = normalizeMessagesForAPI(
    context.messages,
    context.filteredTools,
  )
  queryCheckpoint('query_message_normalization_end')

  // Model-specific post-processing: strip tool-search-specific fields if the
  // selected model doesn't support tool search.
  //
  // Why is this needed in addition to normalizeMessagesForAPI?
  // - normalizeMessagesForAPI uses isToolSearchEnabledNoModelCheck() because it's
  //   called from ~20 places (analytics, feedback, sharing, etc.), many of which
  //   don't have model context. Adding model to its signature would be a large refactor.
  // - This post-processing uses the model-aware isToolSearchEnabled() check
  // - This handles mid-conversation model switching (e.g., Sonnet → Haiku) where
  //   stale tool-search fields from the previous model would cause 400 errors
  //
  // Note: For assistant messages, normalizeMessagesForAPI already normalized the
  // tool inputs, so stripCallerFieldFromAssistantMessage only needs to remove the
  // 'caller' field (not re-normalize inputs).
  if (!context.useToolSearch) {
    messagesForAPI = messagesForAPI.map(msg => {
      switch (msg.type) {
        case 'user':
          // Strip tool_reference blocks from tool_result content
          return stripToolReferenceBlocksFromUserMessage(msg)
        case 'assistant':
          // Strip 'caller' field from tool_use blocks
          return stripCallerFieldFromAssistantMessage(msg)
        default:
          return msg
      }
    })
  }

  // Repair tool_use/tool_result pairing mismatches that can occur when resuming
  // remote/teleport sessions. Inserts synthetic error tool_results for orphaned
  // tool_uses and strips orphaned tool_results referencing non-existent tool_uses.
  messagesForAPI = ensureToolResultPairing(messagesForAPI)

  // Strip advisor blocks — the API rejects them without the beta header.
  if (!context.betas.includes(ADVISOR_BETA_HEADER)) {
    messagesForAPI = stripAdvisorBlocks(messagesForAPI)
  }

  // Strip excess media items before making the API call.
  // The API rejects requests with >100 media items but returns a confusing error.
  // Rather than erroring (which is hard to recover from in Cowork/CCD), we
  // silently drop the oldest media items to stay within the limit.
  messagesForAPI = stripExcessMediaItems(
    messagesForAPI,
    API_MAX_MEDIA_PER_REQUEST,
  )

  // Instrumentation: Track message count after normalization
  logEvent('tengu_api_after_normalize', {
    postNormalizedMessageCount: messagesForAPI.length,
  })

  // Compute fingerprint from first user message for attribution.
  // Must run BEFORE injecting synthetic messages (e.g. deferred tool names)
  // so the fingerprint reflects the actual user input.
  const fingerprint = computeFingerprintFromMessages(messagesForAPI)

  // When the delta attachment is enabled, deferred tools are announced
  // via persisted deferred_tools_delta attachments instead of this
  // ephemeral prepend (which busts cache whenever the pool changes).
  if (context.useToolSearch && !isDeferredToolsDeltaEnabled()) {
    const deferredToolList = context.tools
      .filter(t => context.deferredToolNames.has(t.name))
      .map(formatDeferredToolLine)
      .sort()
      .join('\n')
    if (deferredToolList) {
      messagesForAPI = [
        createUserMessage({
          content: `<available-deferred-tools>\n${deferredToolList}\n</available-deferred-tools>`,
          isMeta: true,
        }),
        ...messagesForAPI,
      ]
    }
  }

  // Chrome tool-search instructions: when the delta attachment is enabled,
  // these are carried as a client-side block in mcp_instructions_delta
  // (attachments.ts) instead of here. This per-request sys-prompt append
  // busts the prompt cache when chrome connects late.
  const hasChromeTools = context.filteredTools.some(t =>
    isToolFromMcpServer(t.name, CLAUDE_IN_CHROME_MCP_SERVER_NAME),
  )
  const injectChromeHere =
    context.useToolSearch &&
    hasChromeTools &&
    !isMcpInstructionsDeltaEnabled()

  // filter(Boolean) works by converting each element to a boolean - empty strings become false and are filtered out.
  systemPrompt = asSystemPrompt(
    [
      getAttributionHeader(fingerprint),
      getCLISyspromptPrefix({
        isNonInteractive: context.options.isNonInteractiveSession,
        hasAppendSystemPrompt: context.options.hasAppendSystemPrompt,
      }),
      ...systemPrompt,
      ...(context.advisorModel ? [ADVISOR_TOOL_INSTRUCTIONS] : []),
      ...(injectChromeHere ? [CHROME_TOOL_SEARCH_INSTRUCTIONS] : []),
    ].filter(Boolean),
  )

  // Prepend system prompt block for easy API identification
  logAPIPrefix(systemPrompt)

  const enablePromptCaching =
    context.options.enablePromptCaching ??
    getRequestPromptCachingEnabled(context.options.model)
  const system = buildSystemPromptBlocks(systemPrompt, enablePromptCaching, {
    skipGlobalCacheForSystemPrompt: context.needsToolBasedCacheMarker,
    querySource: context.options.querySource,
  })
  const useBetas = context.betas.length > 0

  // Build minimal context for detailed tracing (when beta tracing is enabled)
  // Note: The actual new_context message extraction is done in sessionTracing.ts using
  // hash-based tracking per querySource (agent) from the messagesForAPI array
  const extraToolSchemas = [...(context.options.extraToolSchemas ?? [])]
  if (context.advisorModel) {
    // Server tools must be in the tools array by API contract. Appended after
    // toolSchemas (which carries the cache_control marker) so toggling /advisor
    // only churns the small suffix, not the cached prefix.
    extraToolSchemas.push({
      type: 'advisor_20260301',
      name: 'advisor',
      model: context.advisorModel,
    } as unknown as BetaToolUnion)
  }
  const allTools = [...context.toolSchemas, ...extraToolSchemas]

  return {
    messagesForAPI,
    fingerprint,
    systemPrompt,
    system,
    useBetas,
    allTools,
  }
}

import { feature } from 'bun:bundle'
import chalk from 'chalk'
import { markPostCompaction } from 'src/bootstrap/state.js'
import { getSystemPrompt } from '../../constants/prompts.js'
import { getSystemContext, getUserContext } from '../../context.js'
import { getShortcutDisplay } from '../../keybindings/shortcutFormat.js'
import { notifyCompaction } from '../../services/api/promptCacheBreakDetection.js'
import {
  type CompactionResult,
  compactConversation,
  ERROR_MESSAGE_INCOMPLETE_RESPONSE,
  ERROR_MESSAGE_NOT_ENOUGH_MESSAGES,
  ERROR_MESSAGE_USER_ABORT,
  mergeHookInstructions,
} from '../../services/compact/compact.js'
import { suppressCompactWarning } from '../../services/compact/compactWarningState.js'
import { microcompactMessages } from '../../services/compact/microCompact.js'
import { runPostCompactCleanup } from '../../services/compact/postCompactCleanup.js'
import { trySessionMemoryCompaction } from '../../services/compact/sessionMemoryCompact.js'
import { manuallyExtractSessionMemory } from '../../services/SessionMemory/sessionMemory.js'
import {
  getLastSummarizedMessageId,
  setLastSummarizedMessageId,
} from '../../services/SessionMemory/sessionMemoryUtils.js'
import type { ToolUseContext } from '../../Tool.js'
import type { LocalCommandCall } from '../../types/command.js'
import type { Message } from '../../types/message.js'
import { hasExactErrorMessage } from '../../utils/errors.js'
import { executePreCompactHooks } from '../../utils/hooks.js'
import { logError } from '../../utils/log.js'
import { getMessagesAfterCompactBoundary } from '../../utils/messages.js'
import { getEffectiveCompactionMode } from '../../utils/config.js'
import { getUpgradeMessage } from '../../utils/model/contextWindowUpgradeCheck.js'
import {
  buildEffectiveSystemPrompt,
  type SystemPrompt,
} from '../../utils/systemPrompt.js'

/* eslint-disable @typescript-eslint/no-require-imports */
type ReactiveCompactSuccess = {
  ok: true
  result: CompactionResult
}

type ReactiveCompactFailure = {
  ok: false
  reason:
    | 'too_few_groups'
    | 'aborted'
    | 'exhausted'
    | 'error'
    | 'media_unstrippable'
}

type ReactiveCompactOutcome = ReactiveCompactSuccess | ReactiveCompactFailure

function isReactiveCompactFailure(
  outcome: ReactiveCompactOutcome,
): outcome is ReactiveCompactFailure {
  return outcome.ok === false
}

const reactiveCompact: {
  isReactiveOnlyMode(): boolean
  isWithheldPromptTooLong(assistantEnvelope: unknown): boolean
  reactiveCompactOnPromptTooLong(...args: unknown[]): Promise<ReactiveCompactOutcome>
} | null = null
/* eslint-enable @typescript-eslint/no-require-imports */

export const call: LocalCommandCall = async (args, context) => {
  const { abortController } = context
  let { messages } = context

  // REPL keeps snipped messages for UI scrollback — project so the compact
  // model doesn't summarize content that was intentionally removed.
  messages = getMessagesAfterCompactBoundary(messages)

  if (messages.length === 0) {
    throw new Error('No messages to compact')
  }

  const customInstructions = args.trim()

  try {
    // Summary mode keeps the existing local session-memory compact path.
    // Responses mode must skip it and use the native replacement-history flow.
    if (
      !customInstructions &&
      getEffectiveCompactionMode() === 'summary'
    ) {
      const latestMessageUuid = messages[messages.length - 1]?.uuid
      const lastSummarizedMessageId = getLastSummarizedMessageId()
      const needsSessionMemoryRefresh =
        messages.length > 2 &&
        latestMessageUuid !== undefined &&
        lastSummarizedMessageId !== latestMessageUuid

      if (needsSessionMemoryRefresh) {
        // Refresh the session memory just before manual compaction when the
        // in-memory summary is behind the latest visible work.
        const extractionResult = await manuallyExtractSessionMemory(
          messages,
          context,
        )
        if (!extractionResult.success) {
          throw new Error(
            extractionResult.error ??
              'Failed to refresh session memory before compaction',
          )
        }
      }

      const sessionMemoryResult = await trySessionMemoryCompaction(
        messages,
        context.agentId,
        undefined,
        'manual',
      )
      if (sessionMemoryResult) {
        getUserContext.cache.clear?.()
        runPostCompactCleanup()
        if (feature('PROMPT_CACHE_BREAK_DETECTION')) {
          notifyCompaction(
            context.options.querySource ?? 'compact',
            context.agentId,
          )
        }
        markPostCompaction()
        suppressCompactWarning()

        return {
          type: 'compact',
          compactionResult: sessionMemoryResult,
          displayText: buildDisplayText(
            context,
            undefined,
            hasReadableCompactSummary(sessionMemoryResult),
          ),
        }
      }
    }

    // Reactive-only mode: route /compact through the reactive path.
    if (reactiveCompact?.isReactiveOnlyMode()) {
      return await compactViaReactive(
        messages,
        context,
        customInstructions,
        reactiveCompact,
      )
    }

    // Fall back to traditional compaction
    // Run microcompact first to reduce tokens before summarization
    const microcompactResult = await microcompactMessages(messages, context)
    const messagesForCompact = microcompactResult.messages

    const result = await compactConversation(
      messagesForCompact,
      context,
      await getCacheSharingParams(context, messagesForCompact),
      false,
      customInstructions,
      false,
    )

    // Reset lastSummarizedMessageId since legacy compaction replaces all messages
    // and the old message UUID will no longer exist in the new messages array
    setLastSummarizedMessageId(undefined)

    // Suppress the "Context left until auto-compact" warning after successful compaction
    suppressCompactWarning()

    getUserContext.cache.clear?.()
    runPostCompactCleanup()

    return {
      type: 'compact',
      compactionResult: result,
      displayText: buildDisplayText(
        context,
        result.userDisplayMessage,
        hasReadableCompactSummary(result),
      ),
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error('Compaction canceled.')
    } else if (hasExactErrorMessage(error, ERROR_MESSAGE_NOT_ENOUGH_MESSAGES)) {
      throw new Error(ERROR_MESSAGE_NOT_ENOUGH_MESSAGES)
    } else if (hasExactErrorMessage(error, ERROR_MESSAGE_INCOMPLETE_RESPONSE)) {
      throw new Error(ERROR_MESSAGE_INCOMPLETE_RESPONSE)
    } else {
      logError(error)
      throw new Error(`Error during compaction: ${error}`)
    }
  }
}

async function compactViaReactive(
  messages: Message[],
  context: ToolUseContext,
  customInstructions: string,
  reactive: NonNullable<typeof reactiveCompact>,
): Promise<{
  type: 'compact'
  compactionResult: CompactionResult
  displayText: string
}> {
  context.onCompactProgress?.({
    type: 'hooks_start',
    hookType: 'pre_compact',
  })
  context.setSDKStatus?.('compacting')

  try {
    // Hooks and cache-param build are independent — run concurrently.
    // getCacheSharingParams walks all tools to build the system prompt;
    // pre-compact hooks spawn subprocesses. Neither depends on the other.
    const [hookResult, cacheSafeParams] = await Promise.all([
      executePreCompactHooks(
        { trigger: 'manual', customInstructions: customInstructions || null },
        context.abortController.signal,
      ),
      getCacheSharingParams(context, messages),
    ])
    const mergedInstructions = mergeHookInstructions(
      customInstructions,
      hookResult.newCustomInstructions,
    )

    context.setStreamMode?.('requesting')
    context.setResponseLength?.(() => 0)
    context.onCompactProgress?.({ type: 'compact_start' })

    const outcome = await reactive.reactiveCompactOnPromptTooLong(
      messages,
      cacheSafeParams,
      { customInstructions: mergedInstructions, trigger: 'manual' },
    )

    if (isReactiveCompactFailure(outcome)) {
      // The outer catch in `call` translates these: aborted → "Compaction
      // canceled." (via abortController.signal.aborted check), NOT_ENOUGH →
      // re-thrown as-is, everything else → "Error during compaction: …".
      switch (outcome.reason) {
        case 'too_few_groups':
          throw new Error(ERROR_MESSAGE_NOT_ENOUGH_MESSAGES)
        case 'aborted':
          throw new Error(ERROR_MESSAGE_USER_ABORT)
        case 'exhausted':
        case 'error':
        case 'media_unstrippable':
          throw new Error(ERROR_MESSAGE_INCOMPLETE_RESPONSE)
      }
    }

    const result = outcome.result

    // Mirrors the post-success cleanup in tryReactiveCompact, minus
    // resetMicrocompactState — processSlashCommand calls that for all
    // type:'compact' results.
    setLastSummarizedMessageId(undefined)
    runPostCompactCleanup()
    suppressCompactWarning()
    getUserContext.cache.clear?.()

    // reactiveCompactOnPromptTooLong runs PostCompact hooks but not PreCompact
    // — both callers (here and tryReactiveCompact) run PreCompact outside so
    // they can merge its userDisplayMessage with PostCompact's here. This
    // caller additionally runs it concurrently with getCacheSharingParams.
    const combinedMessage =
      [hookResult.userDisplayMessage, result.userDisplayMessage]
        .filter(Boolean)
        .join('\n') || undefined

    return {
      type: 'compact',
      compactionResult: {
        ...result,
        userDisplayMessage: combinedMessage,
      },
      displayText: buildDisplayText(
        context,
        combinedMessage,
        hasReadableCompactSummary(result),
      ),
    }
  } finally {
    context.setStreamMode?.('requesting')
    context.setResponseLength?.(() => 0)
    context.onCompactProgress?.({ type: 'compact_end' })
    context.setSDKStatus?.(null)
  }
}

function hasReadableCompactSummary(result: CompactionResult): boolean {
  return result.summaryMessages.some(message => message.isCompactSummary === true)
}

export function getCompactDisplayHint(
  verbose: boolean,
  hasReadableSummary: boolean,
  expandShortcut: string,
): string | null {
  if (verbose || !hasReadableSummary) {
    return null
  }

  return `(${expandShortcut} to see full summary)`
}

export function buildDisplayText(
  context: ToolUseContext,
  userDisplayMessage?: string,
  hasReadableSummary: boolean = true,
): string {
  const upgradeMessage = getUpgradeMessage('tip')
  const expandShortcut = getShortcutDisplay(
    'app:toggleTranscript',
    'Global',
    'ctrl+o',
  )
  const dimmed = [
    getCompactDisplayHint(
      context.options.verbose,
      hasReadableSummary,
      expandShortcut,
    ),
    ...(userDisplayMessage ? [userDisplayMessage] : []),
    ...(upgradeMessage ? [upgradeMessage] : []),
  ].filter(Boolean)
  return chalk.dim(
    dimmed.length > 0 ? `Compacted ${dimmed.join('\n')}` : 'Compacted',
  )
}

async function getCacheSharingParams(
  context: ToolUseContext,
  forkContextMessages: Message[],
): Promise<{
  systemPrompt: SystemPrompt
  userContext: { [k: string]: string }
  systemContext: { [k: string]: string }
  toolUseContext: ToolUseContext
  forkContextMessages: Message[]
}> {
  const appState = context.getAppState()
  const defaultSysPrompt = await getSystemPrompt(
    context.options.tools,
    context.options.mainLoopModel,
    Array.from(
      appState.toolPermissionContext.additionalWorkingDirectories.keys(),
    ),
    context.options.mcpClients,
  )
  const systemPrompt = buildEffectiveSystemPrompt({
    mainThreadAgentDefinition: undefined,
    toolUseContext: context,
    customSystemPrompt: context.options.customSystemPrompt,
    defaultSystemPrompt: defaultSysPrompt,
    appendSystemPrompt: context.options.appendSystemPrompt,
  })
  const [userContext, systemContext] = await Promise.all([
    getUserContext(),
    getSystemContext(),
  ])
  return {
    systemPrompt,
    userContext,
    systemContext,
    toolUseContext: context,
    forkContextMessages,
  }
}

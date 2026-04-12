/**
 * Main entrypoint for Codex Code Agent SDK types.
 *
 * This file re-exports the public SDK API from:
 * - sdk/coreTypes.ts - Common serializable types (messages, configs)
 * - sdk/runtimeTypes.ts - Non-serializable types (callbacks, interfaces)
 *
 * SDK builders who need control protocol types should import from
 * sdk/controlTypes.ts directly.
 */

import type {
  CallToolResult,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js'
import type {
  Message as AnthropicMessage,
  RawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/messages/messages.js'
import type { ConfigScope } from '../services/mcp/types.js'
import type { CodexPublicModelInfo } from '../utils/model/codexModels.js'
import type {
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
} from '../types/permissions.js'
import type { z } from 'zod/v4'
import {
  ApiKeySourceSchema,
  ConfigChangeHookInputSchema,
  CwdChangedHookInputSchema,
  ElicitationHookInputSchema,
  ElicitationResultHookInputSchema,
  FileChangedHookInputSchema,
  HookInputSchema,
  InstructionsLoadedHookInputSchema,
  NotificationHookInputSchema,
  PermissionDeniedHookInputSchema,
  PermissionRequestHookInputSchema,
  PostCompactHookInputSchema,
  PostToolUseFailureHookInputSchema,
  PostToolUseHookInputSchema,
  PreCompactHookInputSchema,
  PreToolUseHookInputSchema,
  SessionEndHookInputSchema,
  SessionStartHookInputSchema,
  SetupHookInputSchema,
  StopFailureHookInputSchema,
  StopHookInputSchema,
  SubagentStartHookInputSchema,
  SubagentStopHookInputSchema,
  SyncHookJSONOutputSchema,
  AsyncHookJSONOutputSchema,
  TaskCompletedHookInputSchema,
  TaskCreatedHookInputSchema,
  TeammateIdleHookInputSchema,
  UserPromptSubmitHookInputSchema,
  SDKAPIRetryMessageSchema,
  SDKAssistantMessageErrorSchema,
  SDKAssistantMessageSchema,
  SDKCompactBoundaryMessageSchema,
  SDKMessageSchema,
  SDKModelTurnItemMessageSchema,
  SDKPartialAssistantMessageSchema,
  SDKPermissionDenialSchema,
  SDKRateLimitEventSchema,
  SDKRateLimitInfoSchema,
  SDKResultMessageSchema,
  SDKSessionInfoSchema,
  SDKStatusMessageSchema,
  SDKStatusSchema,
  SDKSystemMessageSchema,
  SDKToolProgressMessageSchema,
  SDKToolUseSummaryMessageSchema,
  SDKUserMessageReplaySchema,
  SDKUserMessageSchema,
  RewindFilesResultSchema,
  McpServerStatusSchema,
} from './sdk/coreSchemas.js'

// Control protocol types for SDK builders (bridge subpath consumers)
/** @alpha */
export type {
  SDKControlRequest,
  SDKControlResponse,
} from './sdk/controlTypes.js'
// Re-export core types (common serializable types)
export * from './sdk/coreTypes.js'
// Re-export runtime types (callbacks, interfaces with methods)
export * from './sdk/runtimeTypes.js'

// Re-export settings types (generated from settings JSON schema)
export type { Settings } from './sdk/settingsTypes.generated.js'
// Re-export tool types (all marked @internal until SDK API stabilizes)
export * from './sdk/toolTypes.js'

// Minimal compatibility types needed by the main app while generated SDK
// runtime/core types are stubbed in this branch.
export type HookEvent = (typeof import('./sdk/coreTypes.js').HOOK_EVENTS)[number]
export type ApiKeySource = z.infer<ReturnType<typeof ApiKeySourceSchema>> | 'api' | 'none'
export type HookInput = z.infer<ReturnType<typeof HookInputSchema>>
export type PreToolUseHookInput = z.infer<ReturnType<typeof PreToolUseHookInputSchema>>
export type PermissionRequestHookInput = z.infer<ReturnType<typeof PermissionRequestHookInputSchema>>
export type PostToolUseHookInput = z.infer<ReturnType<typeof PostToolUseHookInputSchema>>
export type PostToolUseFailureHookInput = z.infer<ReturnType<typeof PostToolUseFailureHookInputSchema>>
export type PermissionDeniedHookInput = z.infer<ReturnType<typeof PermissionDeniedHookInputSchema>>
export type NotificationHookInput = z.infer<ReturnType<typeof NotificationHookInputSchema>>
export type UserPromptSubmitHookInput = z.infer<ReturnType<typeof UserPromptSubmitHookInputSchema>>
export type SessionStartHookInput = z.infer<ReturnType<typeof SessionStartHookInputSchema>>
export type SessionEndHookInput = z.infer<ReturnType<typeof SessionEndHookInputSchema>>
export type SetupHookInput = z.infer<ReturnType<typeof SetupHookInputSchema>>
export type StopHookInput = z.infer<ReturnType<typeof StopHookInputSchema>>
export type StopFailureHookInput = z.infer<ReturnType<typeof StopFailureHookInputSchema>>
export type SubagentStartHookInput = z.infer<ReturnType<typeof SubagentStartHookInputSchema>>
export type SubagentStopHookInput = z.infer<ReturnType<typeof SubagentStopHookInputSchema>>
export type PreCompactHookInput = z.infer<ReturnType<typeof PreCompactHookInputSchema>>
export type PostCompactHookInput = z.infer<ReturnType<typeof PostCompactHookInputSchema>>
export type TeammateIdleHookInput = z.infer<ReturnType<typeof TeammateIdleHookInputSchema>>
export type TaskCreatedHookInput = z.infer<ReturnType<typeof TaskCreatedHookInputSchema>>
export type TaskCompletedHookInput = z.infer<ReturnType<typeof TaskCompletedHookInputSchema>>
export type ElicitationHookInput = z.infer<ReturnType<typeof ElicitationHookInputSchema>>
export type ElicitationResultHookInput = z.infer<ReturnType<typeof ElicitationResultHookInputSchema>>
export type ConfigChangeHookInput = z.infer<ReturnType<typeof ConfigChangeHookInputSchema>>
export type InstructionsLoadedHookInput = z.infer<ReturnType<typeof InstructionsLoadedHookInputSchema>>
export type CwdChangedHookInput = z.infer<ReturnType<typeof CwdChangedHookInputSchema>>
export type FileChangedHookInput = z.infer<ReturnType<typeof FileChangedHookInputSchema>>
export type SyncHookJSONOutput = z.infer<ReturnType<typeof SyncHookJSONOutputSchema>>
export type AsyncHookJSONOutput = z.infer<ReturnType<typeof AsyncHookJSONOutputSchema>>
export type HookJSONOutput = SyncHookJSONOutput | AsyncHookJSONOutput
export type SDKAssistantMessageError = z.infer<ReturnType<typeof SDKAssistantMessageErrorSchema>>
export type SDKStatus = z.infer<ReturnType<typeof SDKStatusSchema>>
export type SDKUserMessage = {
  type: 'user'
  message: { role?: 'user'; content: string | Array<unknown> }
  parent_tool_use_id: string | null
  uuid?: string
  session_id?: string
  isSynthetic?: boolean
  tool_use_result?: unknown
  priority?: 'now' | 'next' | 'later'
  timestamp?: string
}
export type SDKUserMessageReplay = SDKUserMessage & {
  uuid: string
  session_id: string
  isReplay: true
}
export type SDKAssistantMessage = {
  type: 'assistant'
  message: AnthropicMessage
  parent_tool_use_id: string | null
  error?: SDKAssistantMessageError
  uuid: string
  session_id: string
}
export type SDKPartialAssistantMessage = {
  type: 'stream_event'
  event: RawMessageStreamEvent
  parent_tool_use_id: string | null
  uuid: string
  session_id: string
}
export type SDKCompactBoundaryMessage = z.infer<ReturnType<typeof SDKCompactBoundaryMessageSchema>>
export type SDKSystemMessage = z.infer<ReturnType<typeof SDKSystemMessageSchema>>
export type SDKStatusMessage = z.infer<ReturnType<typeof SDKStatusMessageSchema>>
export type SDKToolProgressMessage = z.infer<ReturnType<typeof SDKToolProgressMessageSchema>>
export type SDKPermissionDenial = z.infer<ReturnType<typeof SDKPermissionDenialSchema>>
export type SDKToolUseSummaryMessage = z.infer<ReturnType<typeof SDKToolUseSummaryMessageSchema>>
export type SDKRateLimitInfo = z.infer<ReturnType<typeof SDKRateLimitInfoSchema>>
export type SDKRateLimitEvent = z.infer<ReturnType<typeof SDKRateLimitEventSchema>>
export type SDKAPIRetryMessage = z.infer<ReturnType<typeof SDKAPIRetryMessageSchema>>
export type SDKModelTurnItemMessage = z.infer<ReturnType<typeof SDKModelTurnItemMessageSchema>>
export type SDKResultMessage = z.infer<ReturnType<typeof SDKResultMessageSchema>>
export type SDKResultSuccess = Extract<SDKResultMessage, { subtype: 'success' }>
export type SDKResultError = Exclude<SDKResultMessage, { subtype: 'success' }>
export type SDKMessage =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKUserMessageReplay
  | SDKResultMessage
  | SDKSystemMessage
  | SDKPartialAssistantMessage
  | SDKCompactBoundaryMessage
  | SDKModelTurnItemMessage
  | SDKStatusMessage
  | SDKAPIRetryMessage
  | SDKToolProgressMessage
  | SDKToolUseSummaryMessage
  | SDKRateLimitEvent
  | z.infer<ReturnType<typeof SDKMessageSchema>>
export type SDKSessionInfo = z.infer<ReturnType<typeof SDKSessionInfoSchema>>
export type McpServerConfigForProcessTransport =
  | { type?: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'sse'; url: string; headers?: Record<string, string> }
  | { type: 'http'; url: string; headers?: Record<string, string> }
  | { type: 'sdk'; name: string }
export type McpServerStatus = z.infer<ReturnType<typeof McpServerStatusSchema>> & {
  scope?: ConfigScope
}
export type ModelInfo = CodexPublicModelInfo
export type RewindFilesResult = z.infer<ReturnType<typeof RewindFilesResultSchema>>
export type AnyZodRawShape = Record<string, unknown>
export type ForkSessionOptions = unknown
export type ForkSessionResult = unknown
export type GetSessionInfoOptions = unknown
export type GetSessionMessagesOptions = unknown
export type InferShape<T> = T
export type InternalOptions = unknown
export type InternalQuery = unknown
export type ListSessionsOptions = unknown
export type McpSdkServerConfigWithInstance = unknown
export type Options = unknown
export type Query = unknown
export type SDKSession = unknown
export type SDKSessionOptions = unknown
export type SdkMcpToolDefinition<T = unknown> = unknown
export type SessionMessage = unknown
export type SessionMutationOptions = unknown
export type ExitReason = (typeof import('./sdk/coreTypes.js').EXIT_REASONS)[number]
export type ModelUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  webSearchRequests: number
  costUSD: number
  contextWindow: number
  maxOutputTokens: number
}
export type { PermissionMode, PermissionResult, PermissionUpdate }

// ============================================================================
// Functions
// ============================================================================

// Import types needed for function signatures


export function tool<Schema extends AnyZodRawShape>(
  _name: string,
  _description: string,
  _inputSchema: Schema,
  _handler: (
    args: InferShape<Schema>,
    extra: unknown,
  ) => Promise<CallToolResult>,
  _extras?: {
    annotations?: ToolAnnotations
    searchHint?: string
    alwaysLoad?: boolean
  },
): SdkMcpToolDefinition<Schema> {
  throw new Error('not implemented')
}

type CreateSdkMcpServerOptions = {
  name: string
  version?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: Array<SdkMcpToolDefinition<any>>
}

/**
 * Creates an MCP server instance that can be used with the SDK transport.
 * This allows SDK users to define custom tools that run in the same process.
 *
 * If your SDK MCP calls will run longer than 60s, override CODEX_CODE_STREAM_CLOSE_TIMEOUT
 */
export function createSdkMcpServer(
  _options: CreateSdkMcpServerOptions,
): McpSdkServerConfigWithInstance {
  throw new Error('not implemented')
}

export class AbortError extends Error {}

/** @internal */
export function query(_params: {
  prompt: string | AsyncIterable<SDKUserMessage>
  options?: InternalOptions
}): InternalQuery
export function query(_params: {
  prompt: string | AsyncIterable<SDKUserMessage>
  options?: Options
}): Query
export function query(): Query {
  throw new Error('query is not implemented in the SDK')
}

/**
 * V2 API - UNSTABLE
 * Create a persistent session for multi-turn conversations.
 * @alpha
 */
export function unstable_v2_createSession(
  _options: SDKSessionOptions,
): SDKSession {
  throw new Error('unstable_v2_createSession is not implemented in the SDK')
}

/**
 * V2 API - UNSTABLE
 * Resume an existing session by ID.
 * @alpha
 */
export function unstable_v2_resumeSession(
  _sessionId: string,
  _options: SDKSessionOptions,
): SDKSession {
  throw new Error('unstable_v2_resumeSession is not implemented in the SDK')
}

// @[MODEL LAUNCH]: Update the example model ID in this docstring.
/**
 * V2 API - UNSTABLE
 * One-shot convenience function for single prompts.
 * @alpha
 *
 * @example
 * ```typescript
 * const result = await unstable_v2_prompt("What files are here?", {
 *   model: 'claude-sonnet-4-6'
 * })
 * ```
 */
export async function unstable_v2_prompt(
  _message: string,
  _options: SDKSessionOptions,
): Promise<SDKResultMessage> {
  throw new Error('unstable_v2_prompt is not implemented in the SDK')
}

/**
 * Reads a session's conversation messages from its JSONL transcript file.
 *
 * Parses the transcript, builds the conversation chain via parentUuid links,
 * and returns user/assistant messages in chronological order. Set
 * `includeSystemMessages: true` in options to also include system messages.
 *
 * @param sessionId - UUID of the session to read
 * @param options - Optional dir, limit, offset, and includeSystemMessages
 * @returns Array of messages, or empty array if session not found
 */
export async function getSessionMessages(
  _sessionId: string,
  _options?: GetSessionMessagesOptions,
): Promise<SessionMessage[]> {
  throw new Error('getSessionMessages is not implemented in the SDK')
}

/**
 * List sessions with metadata.
 *
 * When `dir` is provided, returns sessions for that project directory
 * and its git worktrees. When omitted, returns sessions across all
 * projects.
 *
 * Use `limit` and `offset` for pagination.
 *
 * @example
 * ```typescript
 * // List sessions for a specific project
 * const sessions = await listSessions({ dir: '/path/to/project' })
 *
 * // Paginate
 * const page1 = await listSessions({ limit: 50 })
 * const page2 = await listSessions({ limit: 50, offset: 50 })
 * ```
 */
export async function listSessions(
  _options?: ListSessionsOptions,
): Promise<SDKSessionInfo[]> {
  throw new Error('listSessions is not implemented in the SDK')
}

/**
 * Reads metadata for a single session by ID. Unlike `listSessions`, this only
 * reads the single session file rather than every session in the project.
 * Returns undefined if the session file is not found, is a sidechain session,
 * or has no extractable summary.
 *
 * @param sessionId - UUID of the session
 * @param options - `{ dir?: string }` project path; omit to search all project directories
 */
export async function getSessionInfo(
  _sessionId: string,
  _options?: GetSessionInfoOptions,
): Promise<SDKSessionInfo | undefined> {
  throw new Error('getSessionInfo is not implemented in the SDK')
}

/**
 * Rename a session. Appends a custom-title entry to the session's JSONL file.
 * @param sessionId - UUID of the session
 * @param title - New title
 * @param options - `{ dir?: string }` project path; omit to search all projects
 */
export async function renameSession(
  _sessionId: string,
  _title: string,
  _options?: SessionMutationOptions,
): Promise<void> {
  throw new Error('renameSession is not implemented in the SDK')
}

/**
 * Tag a session. Pass null to clear the tag.
 * @param sessionId - UUID of the session
 * @param tag - Tag string, or null to clear
 * @param options - `{ dir?: string }` project path; omit to search all projects
 */
export async function tagSession(
  _sessionId: string,
  _tag: string | null,
  _options?: SessionMutationOptions,
): Promise<void> {
  throw new Error('tagSession is not implemented in the SDK')
}

/**
 * Fork a session into a new branch with fresh UUIDs.
 *
 * Copies transcript messages from the source session into a new session file,
 * remapping every message UUID and preserving the parentUuid chain. Supports
 * `upToMessageId` for branching from a specific point in the conversation.
 *
 * Forked sessions start without undo history (file-history snapshots are not
 * copied).
 *
 * @param sessionId - UUID of the source session
 * @param options - `{ dir?, upToMessageId?, title? }`
 * @returns `{ sessionId }` — UUID of the new forked session
 */
export async function forkSession(
  _sessionId: string,
  _options?: ForkSessionOptions,
): Promise<ForkSessionResult> {
  throw new Error('forkSession is not implemented in the SDK')
}

// ============================================================================
// Assistant daemon primitives (internal)
// ============================================================================

/**
 * A scheduled task from `<dir>/.claude/scheduled_tasks.json`.
 * @internal
 */
export type CronTask = {
  id: string
  cron: string
  prompt: string
  createdAt: number
  recurring?: boolean
}

/**
 * Cron scheduler tuning knobs (jitter + expiry). Sourced at runtime from the
 * `tengu_kairos_cron_config` GrowthBook config in CLI sessions; daemon hosts
 * pass this through `watchScheduledTasks({ getJitterConfig })` to get the
 * same tuning.
 * @internal
 */
export type CronJitterConfig = {
  recurringFrac: number
  recurringCapMs: number
  oneShotMaxMs: number
  oneShotFloorMs: number
  oneShotMinuteMod: number
  recurringMaxAgeMs: number
}

/**
 * Event yielded by `watchScheduledTasks()`.
 * @internal
 */
export type ScheduledTaskEvent =
  | { type: 'fire'; task: CronTask }
  | { type: 'missed'; tasks: CronTask[] }

/**
 * Handle returned by `watchScheduledTasks()`.
 * @internal
 */
export type ScheduledTasksHandle = {
  /** Async stream of fire/missed events. Drain with `for await`. */
  events(): AsyncGenerator<ScheduledTaskEvent>
  /**
   * Epoch ms of the soonest scheduled fire across all loaded tasks, or null
   * if nothing is scheduled. Useful for deciding whether to tear down an
   * idle agent subprocess or keep it warm for an imminent fire.
   */
  getNextFireTime(): number | null
}

/**
 * Watch `<dir>/.claude/scheduled_tasks.json` and yield events as tasks fire.
 *
 * Acquires the per-directory scheduler lock (PID-based liveness) so a REPL
 * session in the same dir won't double-fire. Releases the lock and closes
 * the file watcher when the signal aborts.
 *
 * - `fire` — a task whose cron schedule was met. One-shot tasks are already
 *   deleted from the file when this yields; recurring tasks are rescheduled
 *   (or deleted if aged out).
 * - `missed` — one-shot tasks whose window passed while the daemon was down.
 *   Yielded once on initial load; a background delete removes them from the
 *   file shortly after.
 *
 * Intended for daemon architectures that own the scheduler externally and
 * spawn the agent via `query()`; the agent subprocess (`-p` mode) does not
 * run its own scheduler.
 *
 * @internal
 */
export function watchScheduledTasks(_opts: {
  dir: string
  signal: AbortSignal
  getJitterConfig?: () => CronJitterConfig
}): ScheduledTasksHandle {
  throw new Error('not implemented')
}

/**
 * Format missed one-shot tasks into a prompt that asks the model to confirm
 * with the user (via AskUserQuestion) before executing.
 * @internal
 */
export function buildMissedTaskNotification(_missed: CronTask[]): string {
  throw new Error('not implemented')
}

/**
 * A user message typed on claude.ai, extracted from the bridge WS.
 * @internal
 */
export type InboundPrompt = {
  content: string | unknown[]
  uuid?: string
}

/**
 * Options for connectRemoteControl.
 * @internal
 */
export type ConnectRemoteControlOptions = {
  dir: string
  name?: string
  workerType?: string
  branch?: string
  gitRepoUrl?: string | null
  getAccessToken: () => string | undefined
  baseUrl: string
  orgUUID: string
  model: string
}

/**
 * Handle returned by connectRemoteControl. Write query() yields in,
 * read inbound prompts out. See src/assistant/daemonBridge.ts for full
 * field documentation.
 * @internal
 */
export type RemoteControlHandle = {
  sessionUrl: string
  environmentId: string
  bridgeSessionId: string
  write(msg: SDKMessage): void
  sendResult(): void
  sendControlRequest(req: unknown): void
  sendControlResponse(res: unknown): void
  sendControlCancelRequest(requestId: string): void
  inboundPrompts(): AsyncGenerator<InboundPrompt>
  controlRequests(): AsyncGenerator<unknown>
  permissionResponses(): AsyncGenerator<unknown>
  onStateChange(
    cb: (
      state: 'ready' | 'connected' | 'reconnecting' | 'failed',
      detail?: string,
    ) => void,
  ): void
  teardown(): Promise<void>
}

/**
 * Hold a claude.ai remote-control bridge connection from a daemon process.
 *
 * The daemon owns the WebSocket in the PARENT process — if the agent
 * subprocess (spawned via `query()`) crashes, the daemon respawns it while
 * claude.ai keeps the same session. Contrast with `query.enableRemoteControl`
 * which puts the WS in the CHILD process (dies with the agent).
 *
 * Pipe `query()` yields through `write()` + `sendResult()`. Read
 * `inboundPrompts()` (user typed on claude.ai) into `query()`'s input
 * stream. Handle `controlRequests()` locally (interrupt → abort, set_model
 * → reconfigure).
 *
 * Skips the `tengu_ccr_bridge` gate and policy-limits check — @internal
 * caller is pre-entitled. OAuth is still required (env var or keychain).
 *
 * Returns null on no-OAuth or registration failure.
 *
 * @internal
 */
export async function connectRemoteControl(
  _opts: ConnectRemoteControlOptions,
): Promise<RemoteControlHandle | null> {
  throw new Error('not implemented')
}

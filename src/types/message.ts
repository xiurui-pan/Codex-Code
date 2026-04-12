import type {
  ContentBlock,
  ContentBlockParam,
  ImageBlockParam,
  TextBlockParam,
  ThinkingBlock,
  ThinkingBlockParam,
  ToolResultBlockParam,
  ToolUseBlock,
  ToolUseBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { UUID } from 'crypto'
import type { ModelTurnItem } from '../services/api/modelTurnItems.js'
import type {
  BranchAction,
  CommitKind,
  PrAction,
} from '../tools/shared/gitOperationTracking.js'
import type { HookProgress } from './hooks.js'
import type { AgentId } from './ids.js'
import type { ToolProgressData } from './tools.js'

export type MessageOrigin =
  | { kind: 'human' }
  | { kind: 'channel'; server: string }
  | { kind: 'task-notification' }
  | { kind: 'coordinator' }

export type SystemMessageLevel =
  | 'info'
  | 'warn'
  | 'warning'
  | 'error'
  | 'success'
  | 'suggestion'

export type PartialCompactDirection = 'from' | 'to'

export type StopHookInfo = {
  hookName?: string
  hookEventName?: string
  decision?: string
  reason?: string
  command?: string
  promptText?: string
  durationMs?: number
}

export type CompactMetadata = {
  boundaryUuid?: UUID | string
  direction?: PartialCompactDirection
  summary?: string
  trigger?: 'manual' | 'auto'
  preTokens?: number
  userContext?: string
  messagesSummarized?: number
  preCompactDiscoveredTools?: string[]
  preservedSegment?: {
    headUuid: UUID | string
    anchorUuid: UUID | string
    tailUuid: UUID | string
  }
}

export type MicrocompactMetadata = {
  trigger?: 'auto'
  preTokens?: number
  tokensSaved?: number
  compactedToolIds?: string[]
  clearedAttachmentUUIDs?: string[]
}

export type SystemFileSnapshotEntry = {
  key: string
  path: string
  content: string
}

export type AttachmentPayload = {
  type: string
  commandMode?: string
  isMeta?: boolean
  prompt?: string | ContentBlockParam[]
  source_uuid?: UUID | string
  [key: string]: unknown
}

export type RelevantMemoryEntry = {
  path: string
  content: string
  mtimeMs: number
  header?: string
  limit?: number
}

export type CollapsedCommit = {
  sha: string
  kind: CommitKind
}

export type CollapsedPush = {
  branch: string
}

export type CollapsedBranch = {
  ref: string
  action: BranchAction
}

export type CollapsedPr = {
  number: number
  url?: string
  action: PrAction
}

type BaseEnvelope = {
  uuid: UUID | string
  timestamp?: string | number | Date
  sessionId?: string
  requestId?: string
  parentUuid?: UUID | string
  agentId?: AgentId | string
  isMeta?: boolean
  isVisibleInTranscriptOnly?: true
  origin?: MessageOrigin
}

type BaseContentMessage<TType extends string, TMessage> = BaseEnvelope & {
  type: TType
  message: TMessage
}

export type UserMessage = BaseContentMessage<
  'user',
  {
    role?: 'user'
    content: string | ContentBlockParam[]
  }
> & {
  toolUseResult?: unknown
  mcpMeta?: {
    _meta?: Record<string, unknown>
    structuredContent?: Record<string, unknown>
  }
  sourceToolAssistantUUID?: UUID | string
  sourceToolUseID?: string
  permissionMode?: string
  isVirtual?: true
  isCompactSummary?: true
  summarizeMetadata?: {
    messagesSummarized: number
    userContext?: string
    direction?: PartialCompactDirection
  }
  imagePasteIds?: number[]
  planContent?: string
  isApiErrorMessage?: boolean
  modelTurnItems?: ModelTurnItem[]
}

export type AssistantMessage = BaseContentMessage<
  'assistant',
  {
    role?: 'assistant'
    content: ContentBlock[]
    stop_reason?: string | null
    usage?: unknown
    id?: UUID | string
    model?: string
    stop_sequence?: string | null
    type?: string
    container?: unknown
    context_management?: unknown
  }
> & {
  model?: string
  modelTurnItems?: ModelTurnItem[]
  advisorModel?: string
  isApiErrorMessage?: boolean
  apiError?: unknown
  error?: unknown
  errorDetails?: string
  isVirtual?: true
}

export type AttachmentMessage<
  TAttachment extends AttachmentPayload = AttachmentPayload,
> = BaseEnvelope & {
  type: 'attachment'
  attachment: TAttachment
}

export type ProgressData = ToolProgressData | HookProgress

export type ProgressMessage<TData extends ProgressData = ProgressData> =
  BaseEnvelope & {
    type: 'progress'
    parentUuid?: UUID | string
    toolUseId?: string
    toolUseID?: string
    parentToolUseID?: string
    text?: string
    data?: TData
    message?: {
      content?: Array<TextBlockParam | ToolResultBlockParam | ImageBlockParam>
    }
  }

// Hook execution can yield either progress updates or final attachment-backed
// results. Keep the legacy name for callers that still treat hook output as a
// distinct stream.
export type HookResultMessage = AttachmentMessage | ProgressMessage

export type RequestStartEvent = BaseEnvelope & {
  type: 'stream_request_start'
  model?: string
}

export type StreamEvent = BaseEnvelope & {
  type: 'stream_event'
  event: BetaRawMessageStreamEvent
  ttftMs?: number
}

export type SystemMessage = BaseEnvelope & {
  type: 'system'
  subtype?: string
  level?: SystemMessageLevel
  text?: string
  content?: string
  message?: string
  modelTurnItem?: ModelTurnItem
  compactMetadata?: CompactMetadata
  microcompactMetadata?: MicrocompactMetadata
  logicalParentUuid?: UUID | string
  toolUseID?: string
  preventContinuation?: boolean
  commands?: string[]
  url?: string
  upgradeNudge?: string
  durationMs?: number
  budgetTokens?: number
  budgetLimit?: number
  budgetNudges?: number
  messageCount?: number
  writtenPaths?: string[]
  ttftMs?: number
  otps?: number
  isP50?: boolean
  hookDurationMs?: number
  turnDurationMs?: number
  toolDurationMs?: number
  classifierDurationMs?: number
  toolCount?: number
  hookCount?: number
  classifierCount?: number
  configWriteCount?: number
  snapshotFiles?: SystemFileSnapshotEntry[]
  retryAttempt?: number
  maxRetries?: number
  retryInMs?: number
  error?: unknown
  cause?: unknown
}

export type SystemInformationalMessage = SystemMessage
export type SystemAPIErrorMessage = SystemMessage & {
  error?: unknown
  isApiError?: boolean
}
export type SystemAwaySummaryMessage = SystemMessage
export type SystemBridgeStatusMessage = SystemMessage
export type SystemCompactBoundaryMessage = SystemMessage
export type SystemMicrocompactBoundaryMessage = SystemMessage & {
  microcompactMetadata?: MicrocompactMetadata
}
export type SystemMemorySavedMessage = SystemMessage & {
  writtenPaths?: string[]
  teamCount?: number
}
export type SystemLocalCommandMessage = SystemMessage
export type SystemPermissionRetryMessage = SystemMessage & {
  commands?: string[]
}
export type SystemScheduledTaskFireMessage = SystemMessage
export type SystemStopHookSummaryMessage = SystemMessage & {
  stopHookInfo?: StopHookInfo
  hookCount: number
  hookInfos: StopHookInfo[]
  hookErrors: string[]
  preventedContinuation: boolean
  stopReason?: string
  hasOutput?: boolean
  toolUseID?: string
  hookLabel?: string
  totalDurationMs?: number
}
export type SystemThinkingMessage = SystemMessage
export type SystemTurnDurationMessage = SystemMessage & {
  durationMs?: number
  budgetTokens?: number
  budgetLimit?: number
  budgetNudges?: number
  messageCount?: number
}
export type SystemApiMetricsMessage = SystemMessage & {
  ttftMs?: number
  otps?: number
  isP50?: boolean
  hookDurationMs?: number
  turnDurationMs?: number
  toolDurationMs?: number
  classifierDurationMs?: number
  toolCount?: number
  hookCount?: number
  classifierCount?: number
  configWriteCount?: number
}
export type SystemAgentsKilledMessage = SystemMessage
export type SystemFileSnapshotMessage = SystemMessage & {
  snapshotFiles?: SystemFileSnapshotEntry[]
}

export type TombstoneMessage = BaseEnvelope & {
  type: 'tombstone'
  targetUuid?: UUID | string
}

export type ToolUseSummaryMessage = BaseEnvelope & {
  type: 'tool_use_summary'
  summary: string
  precedingToolUseIds: string[]
  toolUseId?: string
  toolName?: string
  blocks?: Array<ToolUseBlock | ToolUseBlockParam>
}

export type NormalizedUserMessage = Omit<UserMessage, 'message'> & {
  message: Omit<UserMessage['message'], 'content'> & {
    content: ContentBlockParam[]
  }
}

export type NormalizedAssistantMessage<
  TContentBlock extends ContentBlock = ContentBlock,
> = Omit<AssistantMessage, 'message'> & {
  message: Omit<AssistantMessage['message'], 'content'> & {
    content: TContentBlock[]
  }
  advisorModel?: string
}

export type NormalizedAssistantToolUseMessage =
  NormalizedAssistantMessage<ToolUseBlock>

export type GroupedToolUseMessage = BaseEnvelope & {
  type: 'grouped_tool_use'
  children?: Message[]
  messages: NormalizedAssistantToolUseMessage[]
  results: NormalizedUserMessage[]
  displayMessage: NormalizedAssistantToolUseMessage
  toolName: string
  messageId: string
}

export type CollapsibleToolUseMessage =
  | NormalizedAssistantToolUseMessage
  | GroupedToolUseMessage

export type CollapsibleToolResultMessage = NormalizedUserMessage

export type CollapsibleMessage =
  | CollapsibleToolUseMessage
  | CollapsibleToolResultMessage

export type CollapsedReadSearchGroup = BaseEnvelope & {
  type: 'collapsed_read_search' | 'collapsed_read_search_group'
  children?: Message[]
  messages: CollapsibleMessage[]
  displayMessage: CollapsibleMessage
  searchCount: number
  readCount: number
  listCount: number
  replCount: number
  memorySearchCount: number
  memoryReadCount: number
  memoryWriteCount: number
  readFilePaths: string[]
  searchArgs: string[]
  latestDisplayHint?: string
  teamMemoryWriteCount?: number
  teamMemoryReadCount?: number
  teamMemorySearchCount?: number
  mcpCallCount?: number
  mcpServerNames?: string[]
  bashCount?: number
  gitOpBashCount?: number
  commits?: CollapsedCommit[]
  pushes?: CollapsedPush[]
  branches?: CollapsedBranch[]
  prs?: CollapsedPr[]
  hookTotalMs?: number
  hookCount?: number
  hookInfos?: StopHookInfo[]
  relevantMemories?: RelevantMemoryEntry[]
}

export type NormalizedMessage =
  | NormalizedUserMessage
  | NormalizedAssistantMessage
  | AttachmentMessage
  | ProgressMessage
  | HookResultMessage
  | SystemMessage
  | TombstoneMessage
  | ToolUseSummaryMessage
  | GroupedToolUseMessage
  | CollapsedReadSearchGroup

export type RenderableMessage = NormalizedMessage

export type Message =
  | UserMessage
  | AssistantMessage
  | AttachmentMessage
  | ProgressMessage
  | HookResultMessage
  | RequestStartEvent
  | StreamEvent
  | SystemMessage
  | TombstoneMessage
  | ToolUseSummaryMessage
  | GroupedToolUseMessage
  | CollapsedReadSearchGroup

export type MessageContentBlock =
  | ContentBlock
  | ContentBlockParam
  | TextBlockParam
  | ThinkingBlock
  | ThinkingBlockParam
  | ToolUseBlock
  | ToolUseBlockParam
  | ToolResultBlockParam

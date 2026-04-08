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
import type { UUID } from 'crypto'
import type { AgentId } from './ids.js'
import type { ModelTurnItem } from '../services/api/modelTurnItems.js'

export type MessageOrigin =
  | 'user'
  | 'assistant'
  | 'system'
  | 'attachment'
  | 'hook'
  | 'tool'
  | 'sdk'
  | 'remote'
  | 'teammate'

export type SystemMessageLevel = 'info' | 'warn' | 'error' | 'success'

export type PartialCompactDirection = 'from' | 'to'

export type StopHookInfo = {
  hookName?: string
  hookEventName?: string
  decision?: string
  reason?: string
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

export type AttachmentPayload = {
  type: string
  commandMode?: string
  isMeta?: boolean
  prompt?: string | ContentBlockParam[]
  source_uuid?: UUID | string
  [key: string]: unknown
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
    content: ContentBlockParam[]
  }
> & {
  toolUseResult?: unknown
  mcpMeta?: {
    _meta?: Record<string, unknown>
    structuredContent?: Record<string, unknown>
  }
  sourceToolAssistantUUID?: UUID | string
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
  }
> & {
  model?: string
  stopReason?: string
  modelTurnItems?: ModelTurnItem[]
}

export type AttachmentMessage<
  TAttachment extends AttachmentPayload = AttachmentPayload,
> = BaseEnvelope & {
  type: 'attachment'
  attachment: TAttachment
}

export type ProgressMessage<TData = unknown> = BaseEnvelope & {
  type: 'progress'
  parentUuid?: UUID | string
  toolUseId?: string
  text?: string
  data?: TData
  message?: {
    content?: Array<TextBlockParam | ToolResultBlockParam | ImageBlockParam>
  }
}

export type HookResultMessage = BaseEnvelope & {
  type: 'hook_result'
  hookName?: string
  message?: {
    content?: ContentBlockParam[]
  }
}

export type RequestStartEvent = BaseEnvelope & {
  type: 'request_start'
  model?: string
}

export type StreamEvent = BaseEnvelope & {
  type:
    | 'stream_event'
    | 'content_block_start'
    | 'content_block_delta'
    | 'content_block_stop'
    | 'message_start'
    | 'message_delta'
    | 'message_stop'
  chunk?: unknown
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
  logicalParentUuid?: UUID | string
}

export type SystemInformationalMessage = SystemMessage
export type SystemAPIErrorMessage = SystemMessage & {
  error?: unknown
  isApiError?: boolean
}
export type SystemAwaySummaryMessage = SystemMessage
export type SystemBridgeStatusMessage = SystemMessage
export type SystemCompactBoundaryMessage = SystemMessage
export type SystemMicrocompactBoundaryMessage = SystemMessage
export type SystemMemorySavedMessage = SystemMessage
export type SystemLocalCommandMessage = SystemMessage
export type SystemPermissionRetryMessage = SystemMessage
export type SystemScheduledTaskFireMessage = SystemMessage
export type SystemStopHookSummaryMessage = SystemMessage & {
  stopHookInfo?: StopHookInfo
}
export type SystemThinkingMessage = SystemMessage
export type SystemTurnDurationMessage = SystemMessage
export type SystemApiMetricsMessage = SystemMessage
export type SystemAgentsKilledMessage = SystemMessage
export type SystemFileSnapshotMessage = SystemMessage

export type TombstoneMessage = BaseEnvelope & {
  type: 'tombstone'
  targetUuid?: UUID | string
}

export type ToolUseSummaryMessage = BaseEnvelope & {
  type: 'tool_use_summary'
  toolUseId?: string
  toolName?: string
  blocks?: Array<ToolUseBlock | ToolUseBlockParam>
}

export type GroupedToolUseMessage = BaseEnvelope & {
  type: 'grouped_tool_use'
  children?: Message[]
  messages?: AssistantMessage[]
  displayMessage?: AssistantMessage
  toolName?: string
}

export type CollapsedReadSearchGroup = BaseEnvelope & {
  type: 'collapsed_read_search' | 'collapsed_read_search_group'
  children?: Message[]
  messages?: Message[]
  searchCount?: number
  readCount?: number
  listCount?: number
  replCount?: number
  memorySearchCount?: number
  memoryReadCount?: number
  memoryWriteCount?: number
  readFilePaths?: string[]
  searchArgs?: string[]
  latestDisplayHint?: string
  teamMemoryWriteCount?: number
  teamMemoryReadCount?: number
  teamMemorySearchCount?: number
  mcpCallCount?: number
  mcpServerNames?: string[]
  bashCount?: number
  gitOpBashCount?: number
  commits?: string[]
  pushes?: string[]
  branches?: string[]
  prs?: string[]
  hookTotalMs?: number
  hookCount?: number
  hookInfos?: unknown[]
  relevantMemories?: unknown[]
}

export type NormalizedUserMessage = UserMessage
export type NormalizedAssistantMessage = AssistantMessage
export type NormalizedMessage =
  | UserMessage
  | AssistantMessage
  | AttachmentMessage
  | ProgressMessage
  | HookResultMessage
  | SystemMessage
  | TombstoneMessage
  | ToolUseSummaryMessage
  | GroupedToolUseMessage
  | CollapsedReadSearchGroup

export type CollapsibleMessage =
  | GroupedToolUseMessage
  | CollapsedReadSearchGroup
  | ProgressMessage

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

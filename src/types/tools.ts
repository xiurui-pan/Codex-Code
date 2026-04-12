export type BashProgress = {
  type: 'bash_progress'
  output: string
  fullOutput: string
  elapsedTimeSeconds: number
  totalLines: number
  totalBytes: number
  taskId?: string
  timeoutMs?: number
}

export type PowerShellProgress = {
  type: 'powershell_progress'
  output: string
  fullOutput: string
  elapsedTimeSeconds: number
  totalLines: number
  totalBytes: number
  timeoutMs?: number
  taskId?: string
}

export type MCPProgress = {
  type: 'mcp_progress'
  [key: string]: unknown
}

export type WebSearchProgress = {
  type: 'web_search_progress'
  [key: string]: unknown
}

import type { AssistantMessage, NormalizedUserMessage } from './message.js'

export type AgentToolProgress = {
  type: 'agent_progress'
  message: AssistantMessage | NormalizedUserMessage
  prompt?: string
  agentId?: string
  [key: string]: unknown
}

export type SkillToolProgress = {
  type: 'skill_progress'
  message: AssistantMessage | NormalizedUserMessage
  prompt?: string
  agentId?: string
  [key: string]: unknown
}

export type TaskOutputProgress = {
  type: 'task_output_progress'
  [key: string]: unknown
}

export type REPLToolProgress = {
  type: 'repl_tool_progress'
  [key: string]: unknown
}

export type SdkWorkflowProgress = {
  type: 'sdk_workflow_progress'
  [key: string]: unknown
}

export type ShellProgress = BashProgress | PowerShellProgress

export type ToolProgressData =
  | ShellProgress
  | MCPProgress
  | WebSearchProgress
  | AgentToolProgress
  | SkillToolProgress
  | TaskOutputProgress
  | REPLToolProgress
  | SdkWorkflowProgress

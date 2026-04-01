export type BashProgress = {
  type: 'bash_progress'
  [key: string]: unknown
}

export type PowerShellProgress = {
  type: 'powershell_progress'
  [key: string]: unknown
}

export type MCPProgress = {
  type: 'mcp_progress'
  [key: string]: unknown
}

export type WebSearchProgress = {
  type: 'web_search_progress'
  [key: string]: unknown
}

export type AgentToolProgress = {
  type: 'agent_tool_progress'
  [key: string]: unknown
}

export type SkillToolProgress = {
  type: 'skill_tool_progress'
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

import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import type { ToolUseContext } from '../../Tool.js'
import { isSearchOrReadBashCommand } from '../../tools/BashTool/BashTool.js'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import { FILE_READ_TOOL_NAME } from '../../tools/FileReadTool/constants.js'
import { GREP_TOOL_NAME } from '../../tools/GrepTool/prompt.js'
import { GLOB_TOOL_NAME } from '../../tools/GlobTool/prompt.js'
import type { AssistantMessage, Message } from '../../types/message.js'
import { isHumanTurn } from '../../utils/messagePredicates.js'

const TOOL_EFFICIENCY_REMINDER_PREFIX = 'Tool-efficiency reminder:'

const CURRENT_BRANCH_QUERY_RE =
  /^git(?:\s+-C\s+(?:"[^"]+"|'[^']+'|\S+))?\s+(?:branch\s+--show-current|rev-parse\s+--abbrev-ref\s+HEAD)(?:\s*\|\|\s*true)?$/i

function normalizeWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

function stripInspectionWrappers(command: string): string {
  let normalized = normalizeWhitespace(command)
  let previous = ''

  while (normalized !== previous) {
    previous = normalized
    normalized = normalized
      .replace(/^pwd\s*&&\s*/i, '')
      .replace(/^cd\s+(?:"[^"]+"|'[^']+'|\S+)\s*&&\s*/i, '')
      .replace(/^git\s+-C\s+(?:"[^"]+"|'[^']+'|\S+)\s+rev-parse\s+--show-toplevel\s*&&\s*/i, '')
      .trim()
  }

  return normalized
}

function normalizeInspectionCommand(command: string): string {
  const normalized = stripInspectionWrappers(command).replace(
    /\s*\|\|\s*true\s*$/i,
    '',
  )
  if (CURRENT_BRANCH_QUERY_RE.test(normalized)) {
    return 'git current-branch'
  }
  return normalizeWhitespace(normalized)
}

function isCurrentBranchQuery(command: string): boolean {
  return CURRENT_BRANCH_QUERY_RE.test(normalizeWhitespace(command))
}

function isInlineFileDumpScript(command: string): boolean {
  const trimmed = command.trim()
  if (!/^(python|python3|node)\b/i.test(trimmed)) {
    return false
  }

  const isInlineScript = /\s<<|(?:^|\s)-c\s/i.test(trimmed)
  if (!isInlineScript) {
    return false
  }

  const hasReadCall =
    /read_text\s*\(/i.test(command) ||
    /readFileSync\s*\(/i.test(command) ||
    /\bopen\s*\(/i.test(command)
  const hasPrintCall =
    /\bprint\s*\(/i.test(command) || /console\.log\s*\(/i.test(command)

  return hasReadCall && hasPrintCall
}

function getMessagesSinceLastHumanTurn(messages: readonly Message[]): Message[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message && isHumanTurn(message)) {
      return messages.slice(i + 1)
    }
  }
  return [...messages]
}

function hasVisibleAssistantText(messages: readonly Message[]): boolean {
  return messages.some(
    message =>
      message.type === 'assistant' &&
      Array.isArray(message.message.content) &&
      message.message.content.some(
        block =>
          block.type === 'text' &&
          typeof block.text === 'string' &&
          block.text.trim().length > 0,
      ),
  )
}

type SuccessfulBashObservation = {
  normalizedCommand: string
  isCurrentBranch: boolean
  isSearchOrRead: boolean
}

function collectSuccessfulBashObservations(
  messages: readonly Message[],
): SuccessfulBashObservation[] {
  const observationsById = new Map<
    string,
    {
      command: string
      resultIsError?: boolean
    }
  >()
  const orderedIds: string[] = []

  for (const message of messages) {
    if (message.type === 'assistant' && Array.isArray(message.message.content)) {
      for (const block of message.message.content) {
        if (
          block.type !== 'tool_use' ||
          block.name !== BASH_TOOL_NAME ||
          typeof block.input !== 'object' ||
          block.input === null ||
          typeof block.input.command !== 'string'
        ) {
          continue
        }
        observationsById.set(block.id, {
          command: block.input.command,
        })
        orderedIds.push(block.id)
      }
      continue
    }

    if (message.type === 'user' && Array.isArray(message.message.content)) {
      for (const block of message.message.content) {
        if (block.type !== 'tool_result') {
          continue
        }
        const observation = observationsById.get(block.tool_use_id)
        if (!observation) {
          continue
        }
        observation.resultIsError = block.is_error === true
      }
    }
  }

  return orderedIds.flatMap(id => {
    const observation = observationsById.get(id)
    if (!observation || observation.resultIsError === true) {
      return []
    }
    const commandForClassification = stripInspectionWrappers(observation.command)
    const commandType = isSearchOrReadBashCommand(commandForClassification)
    return [
      {
        normalizedCommand: normalizeInspectionCommand(observation.command),
        isCurrentBranch: isCurrentBranchQuery(observation.command),
        isSearchOrRead:
          commandType.isSearch || commandType.isRead || commandType.isList,
      },
    ]
  })
}

export function detectRedundantToolCall(
  toolName: string,
  input: unknown,
  toolUseContext: Pick<ToolUseContext, 'messages'>,
): string | null {
  if (
    toolName !== BASH_TOOL_NAME ||
    typeof input !== 'object' ||
    input === null ||
    !('command' in input) ||
    typeof input.command !== 'string'
  ) {
    return null
  }

  const command = input.command
  if (isInlineFileDumpScript(command)) {
    return 'This looks like an inline script whose main job is dumping file contents. Use the Read tool for file contents or rg for matching lines. Only use an inline script when you truly need computation those tools cannot provide.'
  }

  const currentIsBranchQuery = isCurrentBranchQuery(command)
  const currentNormalized = normalizeInspectionCommand(command)
  const currentCommandType = isSearchOrReadBashCommand(stripInspectionWrappers(command))
  const currentIsSearchOrRead =
    currentCommandType.isSearch ||
    currentCommandType.isRead ||
    currentCommandType.isList

  if (!currentIsBranchQuery && !currentIsSearchOrRead) {
    return null
  }

  const previousObservations = collectSuccessfulBashObservations(
    getMessagesSinceLastHumanTurn(toolUseContext.messages),
  )

  if (
    currentIsBranchQuery &&
    previousObservations.some(observation => observation.isCurrentBranch)
  ) {
    return 'You already checked the current git branch for this request. Reuse that result unless repository state has changed.'
  }

  if (
    currentIsSearchOrRead &&
    previousObservations.some(
      observation =>
        observation.isSearchOrRead &&
        observation.normalizedCommand === currentNormalized,
    )
  ) {
    return 'You already ran an equivalent search or read command for this request. Reuse the earlier result or move to a different check instead of repeating the same lookup.'
  }

  return null
}

function hasToolEfficiencyReminder(messages: readonly Message[]): boolean {
  return messages.some(
    message =>
      message.type === 'user' &&
      message.isMeta === true &&
      typeof message.message.content === 'string' &&
      message.message.content.startsWith(TOOL_EFFICIENCY_REMINDER_PREFIX),
  )
}

function hasHanText(text: string): boolean {
  return /[\u3400-\u9fff]/u.test(text)
}

function getLastHumanText(messages: readonly Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || !isHumanTurn(message)) {
      continue
    }
    if (typeof message.message.content === 'string') {
      return message.message.content
    }
    if (Array.isArray(message.message.content)) {
      const text = message.message.content
        .filter(block => block.type === 'text' && typeof block.text === 'string')
        .map(block => block.text)
        .join(' ')
      if (text.trim().length > 0) {
        return text
      }
    }
  }
  return ''
}

function isTestOrBuildCommand(command: string): boolean {
  return /(\b(?:pnpm|npm|yarn|bun|cargo|go|pytest|python(?:3)? -m pytest|vitest|jest|deno|mvn|gradle|make|ctest|uv|ruff|eslint|tsc)\b).*\b(?:test|check|lint|build|typecheck)\b/i.test(
    command,
  )
}

function isGitStatusCommand(command: string): boolean {
  return /^git\b/i.test(command)
}

function classifyToolBatch(toolUseBlocks: readonly ToolUseBlock[]):
  | 'search'
  | 'read'
  | 'checks'
  | 'edit'
  | 'agent'
  | 'git'
  | 'generic' {
  let sawSearch = false
  let sawRead = false
  let sawChecks = false
  let sawEdit = false
  let sawAgent = false
  let sawGit = false

  for (const block of toolUseBlocks) {
    if (block.name === FILE_READ_TOOL_NAME || block.name === GLOB_TOOL_NAME || block.name === GREP_TOOL_NAME) {
      if (block.name === FILE_READ_TOOL_NAME) {
        sawRead = true
      } else {
        sawSearch = true
      }
      continue
    }

    if (block.name === 'Write' || block.name === 'Edit' || block.name === 'NotebookEdit') {
      sawEdit = true
      continue
    }

    if (block.name === 'Agent' || block.name === 'Task') {
      sawAgent = true
      continue
    }

    if (block.name !== BASH_TOOL_NAME || typeof block.input !== 'object' || block.input === null || typeof block.input.command !== 'string') {
      continue
    }

    const command = stripInspectionWrappers(block.input.command)
    const commandType = isSearchOrReadBashCommand(command)
    if (commandType.isSearch || commandType.isList) {
      sawSearch = true
      continue
    }
    if (commandType.isRead) {
      sawRead = true
      continue
    }
    if (isTestOrBuildCommand(command)) {
      sawChecks = true
      continue
    }
    if (isGitStatusCommand(command)) {
      sawGit = true
    }
  }

  if (sawAgent) return 'agent'
  if (sawEdit) return 'edit'
  if (sawChecks) return 'checks'
  if (sawSearch) return 'search'
  if (sawRead) return 'read'
  if (sawGit) return 'git'
  return 'generic'
}

function hasPriorToolWork(messages: readonly Message[]): boolean {
  return messages.some(message => {
    if (message.type === 'assistant' && Array.isArray(message.message.content)) {
      return message.message.content.some(block => block.type === 'tool_use')
    }
    if (message.type === 'user' && Array.isArray(message.message.content)) {
      return message.message.content.some(block => block.type === 'tool_result')
    }
    return false
  })
}

function getSyntheticToolPreambleText(
  kind: 'search' | 'read' | 'checks' | 'edit' | 'agent' | 'git' | 'generic',
  hasPriorWork: boolean,
  useChinese: boolean,
): string {
  if (useChinese) {
    if (hasPriorWork) {
      switch (kind) {
        case 'search':
          return '已经缩小到相关范围了，我再核对最后一个关键点。'
        case 'read':
          return '已经找到相关位置了，我再看一下当前实现细节。'
        case 'checks':
          return '已经定位到大致范围了，我再跑一轮相关检查。'
        case 'edit':
          return '思路已经定下来了，我继续把改动收完整。'
        case 'agent':
          return '已经有初步线索了，我再补一轮定向调查。'
        case 'git':
          return '我先把当前分支和变更范围核对完整。'
        case 'generic':
          return '已经有初步结论了，我再核对一个关键点。'
      }
    }

    switch (kind) {
      case 'search':
        return '先定位相关实现和调用点。'
      case 'read':
        return '先看目标文件里的当前实现。'
      case 'checks':
        return '先跑一遍相关检查，确认问题落点。'
      case 'edit':
        return '先把相关实现和测试一起改好。'
      case 'agent':
        return '先让子代理定向调查，我来收束结果。'
      case 'git':
        return '先核对当前分支和相关变更。'
      case 'generic':
        return '先做一轮定向检查，再收束结论。'
    }
  }

  if (hasPriorWork) {
    switch (kind) {
      case 'search':
        return 'I narrowed the area down; next I am checking the last key detail.'
      case 'read':
        return 'I found the relevant spot; next I am checking the current implementation.'
      case 'checks':
        return 'I narrowed the issue down; next I am running the relevant checks.'
      case 'edit':
        return 'The approach is set; next I am finishing the related code changes.'
      case 'agent':
        return 'I have the first clues; next I am running one more focused investigation.'
      case 'git':
        return 'I am confirming the current branch and change scope before moving on.'
      case 'generic':
        return 'I have the rough picture; next I am checking one remaining detail.'
    }
  }

  switch (kind) {
    case 'search':
      return 'I will locate the relevant implementation and call sites first.'
    case 'read':
      return 'I will inspect the current implementation in the target file first.'
    case 'checks':
      return 'I will run the relevant checks first to pin down the problem.'
    case 'edit':
      return 'I will update the related code and tests first.'
    case 'agent':
      return 'I will start with a focused subagent investigation, then consolidate the result.'
    case 'git':
      return 'I will confirm the current branch and relevant changes first.'
    case 'generic':
      return 'I will do one focused check first, then tighten the answer.'
  }
}

export function buildSyntheticToolPreamble(args: {
  messages: readonly Message[]
  assistantMessages: readonly AssistantMessage[]
  toolUseBlocks: readonly ToolUseBlock[]
  isMainThread: boolean
}): string | null {
  if (!args.isMainThread || args.toolUseBlocks.length === 0) {
    return null
  }

  const currentRequestMessages = getMessagesSinceLastHumanTurn(args.messages)
  if (
    hasVisibleAssistantText(currentRequestMessages) ||
    hasVisibleAssistantText(args.assistantMessages)
  ) {
    return null
  }

  const useChinese = hasHanText(getLastHumanText(args.messages))
  const kind = classifyToolBatch(args.toolUseBlocks)
  const content = getSyntheticToolPreambleText(
    kind,
    hasPriorToolWork(currentRequestMessages),
    useChinese,
  )

  return content
}

export function buildToolEfficiencyReminder(args: {
  messages: readonly Message[]
  assistantMessages: readonly AssistantMessage[]
  toolUseBlocks: readonly ToolUseBlock[]
}): string | null {
  const currentRequestMessages = getMessagesSinceLastHumanTurn(args.messages)
  if (hasToolEfficiencyReminder(currentRequestMessages)) {
    return null
  }

  const hasAssistantText = hasVisibleAssistantText(args.assistantMessages)
  if (hasAssistantText) {
    return null
  }

  let investigativeToolCount = 0

  for (const block of args.toolUseBlocks) {
    if (block.name === BASH_TOOL_NAME) {
      const input = block.input as { command?: unknown } | null
      if (typeof input?.command !== 'string') {
        continue
      }
      const commandType = isSearchOrReadBashCommand(
        stripInspectionWrappers(input.command),
      )
      if (
        commandType.isSearch ||
        commandType.isRead ||
        commandType.isList ||
        isCurrentBranchQuery(input.command) ||
        isInlineFileDumpScript(input.command)
      ) {
        investigativeToolCount++
      }
      continue
    }

    if (
      block.name === FILE_READ_TOOL_NAME ||
      block.name === GREP_TOOL_NAME ||
      block.name === GLOB_TOOL_NAME
    ) {
      investigativeToolCount++
    }
  }

  if (investigativeToolCount < 1) {
    return null
  }

  return `${TOOL_EFFICIENCY_REMINDER_PREFIX} You already have search or read evidence for this request. Reuse earlier evidence instead of repeating the same lookup. Do not repeat single-value checks like the current branch. Do not use inline Python or Node scripts to dump file contents when Read or rg can show what you need. If another tool is still necessary, send one short progress update about what you found and what distinct check comes next; otherwise answer the user directly.`
}

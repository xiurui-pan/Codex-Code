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

export function buildToolEfficiencyReminder(args: {
  messages: readonly Message[]
  assistantMessages: readonly AssistantMessage[]
  toolUseBlocks: readonly ToolUseBlock[]
}): string | null {
  const currentRequestMessages = getMessagesSinceLastHumanTurn(args.messages)
  if (hasToolEfficiencyReminder(currentRequestMessages)) {
    return null
  }

  const hasAssistantText = args.assistantMessages.some(message =>
    Array.isArray(message.message.content) &&
    message.message.content.some(
      block =>
        block.type === 'text' &&
        typeof block.text === 'string' &&
        block.text.trim().length > 0,
    ),
  )
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

  return `${TOOL_EFFICIENCY_REMINDER_PREFIX} You already have search or read evidence for this request. Reuse earlier evidence instead of repeating the same lookup. Do not repeat single-value checks like the current branch. Do not use inline Python or Node scripts to dump file contents when Read or rg can show what you need. If another tool is still necessary, send one short sentence about the next distinct check first; otherwise answer the user directly.`
}

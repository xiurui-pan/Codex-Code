import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { FILE_EDIT_TOOL_NAME } from '../tools/FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../tools/FileReadTool/constants.js'
import {
  compactFileReadOutputForStorage,
  summarizeFileReadOutput,
} from '../tools/FileReadTool/storageShape.js'
import { FILE_WRITE_TOOL_NAME } from '../tools/FileWriteTool/prompt.js'

const MAX_STORED_TOOL_OUTPUT_TEXT_CHARS = 1024

type FileEditLikeResult = {
  filePath: string
  originalFile?: string | null
}

type FileWriteLikeResult = {
  type?: string
  filePath: string
  originalFile?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFileEditLikeResult(value: unknown): value is FileEditLikeResult {
  return (
    isRecord(value) &&
    typeof value.filePath === 'string' &&
    Array.isArray(value.structuredPatch)
  )
}

function isFileWriteLikeResult(value: unknown): value is FileWriteLikeResult {
  return (
    isRecord(value) &&
    typeof value.filePath === 'string' &&
    typeof value.type === 'string'
  )
}

function compactFileEditLikeResult<T extends FileEditLikeResult | FileWriteLikeResult>(
  value: T,
): T {
  if (!('originalFile' in value) || value.originalFile == null) {
    return value
  }
  const { originalFile: _ignored, ...rest } = value
  return rest as T
}

function normalizeToolResultBlockContent(
  content: ToolResultBlockParam['content'],
): string {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .map(block =>
      'text' in block && typeof block.text === 'string' ? block.text : '',
    )
    .filter(Boolean)
    .join('\n')
}

export function summarizeStoredOutputText(text: string): string {
  if (text.length <= MAX_STORED_TOOL_OUTPUT_TEXT_CHARS) {
    return text
  }
  return `${text.slice(0, MAX_STORED_TOOL_OUTPUT_TEXT_CHARS)}…`
}

export function compactToolUseResultForStorage(
  toolName: string | undefined,
  toolUseResult: unknown,
): unknown {
  if (toolName === FILE_READ_TOOL_NAME) {
    return compactFileReadOutputForStorage(
      toolUseResult as import('../tools/FileReadTool/FileReadTool.js').Output,
    )
  }

  if (toolName === FILE_EDIT_TOOL_NAME && isFileEditLikeResult(toolUseResult)) {
    return compactFileEditLikeResult(toolUseResult)
  }

  if (
    toolName === FILE_WRITE_TOOL_NAME &&
    isFileWriteLikeResult(toolUseResult) &&
    toolUseResult.type === 'update'
  ) {
    return compactFileEditLikeResult(toolUseResult)
  }

  if (isFileEditLikeResult(toolUseResult) || isFileWriteLikeResult(toolUseResult)) {
    return compactFileEditLikeResult(toolUseResult)
  }

  if (
    isRecord(toolUseResult) &&
    typeof toolUseResult.type === 'string' &&
    isRecord(toolUseResult.file)
  ) {
    return compactFileReadOutputForStorage(
      toolUseResult as import('../tools/FileReadTool/FileReadTool.js').Output,
    )
  }

  return toolUseResult
}

export function summarizeStoredToolResult(args: {
  toolName?: string
  toolUseResult: unknown
  toolResultBlock?: ToolResultBlockParam
}): string | undefined {
  const { toolName, toolUseResult, toolResultBlock } = args

  if (
    toolName === FILE_READ_TOOL_NAME ||
    (isRecord(toolUseResult) &&
      typeof toolUseResult.type === 'string' &&
      isRecord(toolUseResult.file))
  ) {
    return summarizeFileReadOutput(
      toolUseResult as import('../tools/FileReadTool/FileReadTool.js').Output,
    )
  }

  if (toolName === FILE_EDIT_TOOL_NAME && isFileEditLikeResult(toolUseResult)) {
    return `Edited ${toolUseResult.filePath}`
  }

  if (toolName === FILE_WRITE_TOOL_NAME && isFileWriteLikeResult(toolUseResult)) {
    return toolUseResult.type === 'create'
      ? `Created ${toolUseResult.filePath}`
      : `Updated ${toolUseResult.filePath}`
  }

  if (toolResultBlock) {
    const text = normalizeToolResultBlockContent(toolResultBlock.content)
    if (text.length > 0) {
      return summarizeStoredOutputText(text)
    }
  }

  if (typeof toolUseResult === 'string') {
    return summarizeStoredOutputText(toolUseResult)
  }

  if (isRecord(toolUseResult)) {
    const stdout =
      typeof toolUseResult.stdout === 'string' ? toolUseResult.stdout : ''
    const stderr =
      typeof toolUseResult.stderr === 'string' ? toolUseResult.stderr : ''
    if (stdout || stderr) {
      return summarizeStoredOutputText(
        [stdout, stderr].filter(Boolean).join('\n'),
      )
    }
  }

  return undefined
}

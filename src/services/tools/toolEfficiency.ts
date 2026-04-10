import type { ToolUseContext } from '../../Tool.js'

export function detectRedundantToolCall(
  _toolName: string,
  _input: unknown,
  _toolUseContext: Pick<ToolUseContext, 'messages'>,
): string | null {
  return null
}

export type CurrentSessionMemoryAttachment = {
  type: 'current_session_memory'
  content: string
  path: string
  tokenCount: number
}

export function isCodexSessionMemoryEnabled(): boolean {
  if (process.env.DISABLE_CODEX_SESSION_MEMORY === '1') {
    return false
  }
  if (process.env.ENABLE_CODEX_SESSION_MEMORY === '1') {
    return true
  }
  return process.env.CLAUDE_CODE_USE_CODEX_PROVIDER === '1'
}

export function shouldIncludeCurrentSessionMemory(
  querySource: string | undefined,
): boolean {
  if (!isCodexSessionMemoryEnabled() || !querySource) {
    return false
  }

  if (querySource === 'session_memory' || querySource === 'compact') {
    return false
  }

  return querySource.startsWith('repl_main_thread') || querySource === 'sdk'
}

export function createCurrentSessionMemoryAttachment(params: {
  content: string
  path: string
}): CurrentSessionMemoryAttachment | null {
  const normalizedContent = params.content.trim()
  if (normalizedContent.length === 0) {
    return null
  }

  return {
    type: 'current_session_memory',
    content: normalizedContent,
    path: params.path,
    tokenCount: Math.round(normalizedContent.length / 4),
  }
}

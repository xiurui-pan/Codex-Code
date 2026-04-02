import type { QuerySource } from '../../constants/querySource.js'

export type CurrentSessionMemoryContextItem = {
  kind: 'current_session_memory'
  content: string
  path: string
  tokenCount: number
}

type CurrentSessionMemoryInheritance =
  | 'inherit'
  | 'disabled'
  | 'missing_query_source'
  | 'session_memory_writer'
  | 'compact_summary'
  | 'non_session_query'

const SESSION_MEMORY_DIRECT_QUERY_SOURCES = new Set([
  'sdk',
  'away_summary',
  'feedback',
  'generate_session_title',
  'rename_generate_name',
  'teleport_generate_title',
  'insights',
])

export function isCodexSessionMemoryEnabled(): boolean {
  if (process.env.DISABLE_CODEX_SESSION_MEMORY === '1') {
    return false
  }
  if (process.env.ENABLE_CODEX_SESSION_MEMORY === '1') {
    return true
  }
  return process.env.CLAUDE_CODE_USE_CODEX_PROVIDER === '1'
}

export function getCurrentSessionMemoryInheritance(
  querySource: QuerySource | undefined,
): CurrentSessionMemoryInheritance {
  if (!isCodexSessionMemoryEnabled()) {
    return 'disabled'
  }
  if (!querySource) {
    return 'missing_query_source'
  }
  if (querySource === 'session_memory') {
    return 'session_memory_writer'
  }
  if (querySource === 'compact') {
    return 'compact_summary'
  }
  if (
    querySource.startsWith('repl_main_thread') ||
    querySource.startsWith('agent:') ||
    SESSION_MEMORY_DIRECT_QUERY_SOURCES.has(querySource)
  ) {
    return 'inherit'
  }
  return 'non_session_query'
}

export function shouldIncludeCurrentSessionMemory(
  querySource: QuerySource | undefined,
): boolean {
  return getCurrentSessionMemoryInheritance(querySource) === 'inherit'
}

export function createCurrentSessionMemoryContextItem(params: {
  content: string
  path: string
}): CurrentSessionMemoryContextItem | null {
  const normalizedContent = params.content.trim()
  if (normalizedContent.length === 0) {
    return null
  }

  return {
    kind: 'current_session_memory',
    content: normalizedContent,
    path: params.path,
    tokenCount: Math.round(normalizedContent.length / 4),
  }
}

export async function getCurrentSessionMemoryContextItems(params: {
  querySource: QuerySource | undefined
  content: string | null | undefined
  path: string
  isEmpty(content: string): Promise<boolean>
}): Promise<CurrentSessionMemoryContextItem[]> {
  if (!shouldIncludeCurrentSessionMemory(params.querySource)) {
    return []
  }
  if (!params.content || (await params.isEmpty(params.content))) {
    return []
  }

  const item = createCurrentSessionMemoryContextItem({
    content: params.content,
    path: params.path,
  })
  return item ? [item] : []
}

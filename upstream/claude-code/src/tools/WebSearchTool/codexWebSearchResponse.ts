import type { ModelTurnItem } from '../../services/api/modelTurnItems.js'

export type SearchResponseBlock =
  | {
      type: 'search_call'
      toolUseId: string
      query: string
    }
  | {
      type: 'search_result'
      toolUseId: string
      query: string
      resultCount: number
    }
  | {
      type: 'text'
      text: string
    }

export type WebSearchProgressEvent = {
  toolUseID: string
  data:
    | {
        type: 'query_update'
        query: string
      }
    | {
        type: 'search_results_received'
        resultCount: number
        query: string
      }
}

type ResponsesWebSearchAction =
  | {
      type?: 'search'
      query?: string
      queries?: string[]
    }
  | {
      type?: 'open_page'
      url?: string
    }
  | {
      type?: 'find_in_page'
      url?: string
      pattern?: string
    }

type ResponsesWebSearchCallItem = {
  type?: 'web_search_call'
  id?: string
  status?: string
  action?: ResponsesWebSearchAction
}

function getWebSearchQuery(action: ResponsesWebSearchAction | undefined): string | null {
  if (!action) {
    return null
  }

  if (action.type === 'search') {
    if (typeof action.query === 'string' && action.query.trim()) {
      return action.query.trim()
    }
    if (Array.isArray(action.queries)) {
      const queries = action.queries.filter(
        query => typeof query === 'string' && query.trim(),
      )
      if (queries.length > 0) {
        return queries.join(' | ')
      }
    }
    return null
  }

  if (action.type === 'open_page') {
    return typeof action.url === 'string' && action.url.trim()
      ? action.url.trim()
      : null
  }

  if (action.type === 'find_in_page') {
    if (typeof action.pattern === 'string' && action.pattern.trim()) {
      return action.pattern.trim()
    }
    return typeof action.url === 'string' && action.url.trim()
      ? action.url.trim()
      : null
  }

  return null
}

export function collectCodexWebSearchResponse(
  turnItems: readonly ModelTurnItem[],
  fallbackQuery: string,
): {
  blocks: SearchResponseBlock[]
  progressEvents: WebSearchProgressEvent[]
} {
  const blocks: SearchResponseBlock[] = []
  const progressEvents: WebSearchProgressEvent[] = []
  const seenQueryByToolUseId = new Map<string, string>()
  const emittedResultByToolUseId = new Set<string>()

  for (const item of turnItems) {
    if (item.kind === 'raw_model_output') {
      const payload = item.payload as ResponsesWebSearchCallItem | undefined
      if (payload?.type !== 'web_search_call') {
        continue
      }

      const toolUseId = payload.id?.trim() || `web-search-${seenQueryByToolUseId.size + 1}`
      const query = getWebSearchQuery(payload.action) || fallbackQuery

      if (seenQueryByToolUseId.get(toolUseId) !== query) {
        seenQueryByToolUseId.set(toolUseId, query)
        blocks.push({
          type: 'search_call',
          toolUseId,
          query,
        })
        progressEvents.push({
          toolUseID: toolUseId,
          data: {
            type: 'query_update',
            query,
          },
        })
      }

      if (payload.status === 'completed' && !emittedResultByToolUseId.has(toolUseId)) {
        emittedResultByToolUseId.add(toolUseId)
        blocks.push({
          type: 'search_result',
          toolUseId,
          query,
          resultCount: 0,
        })
        progressEvents.push({
          toolUseID: toolUseId,
          data: {
            type: 'search_results_received',
            resultCount: 0,
            query,
          },
        })
      }
      continue
    }

    if (item.kind === 'final_answer' && item.text.trim()) {
      blocks.push({
        type: 'text',
        text: item.text,
      })
    }
  }

  return { blocks, progressEvents }
}

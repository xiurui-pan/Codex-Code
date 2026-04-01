import type { ModelTurnItem } from '../../services/api/modelTurnItems.js'

export type SearchResponseHit = {
  title: string
  url: string
}

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
      hits: SearchResponseHit[]
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

type ResponsesUrlCitation = {
  type?: string
  url?: string
  title?: string
}

type ResponsesOutputTextPart = {
  type?: 'output_text'
  text?: string
  annotations?: ResponsesUrlCitation[]
}

type ResponsesMessageItem = {
  type?: 'message'
  role?: string
  content?: ResponsesOutputTextPart[]
}


type PendingSearchContext = {
  toolUseId: string
  query: string
}

type CitationGroup = {
  text: string
  hits: SearchResponseHit[]
}

function pushSearchResult(
  blocks: SearchResponseBlock[],
  progressEvents: WebSearchProgressEvent[],
  context: PendingSearchContext,
  hits: SearchResponseHit[],
) {
  blocks.push({
    type: 'search_result',
    toolUseId: context.toolUseId,
    query: context.query,
    hits,
  })
  progressEvents.push({
    toolUseID: context.toolUseId,
    data: {
      type: 'search_results_received',
      resultCount: hits.length,
      query: context.query,
    },
  })
}

function flushCitationGroups(
  groups: CitationGroup[],
  pendingContexts: PendingSearchContext[],
  blocks: SearchResponseBlock[],
  progressEvents: WebSearchProgressEvent[],
): void {
  if (groups.length === 0) {
    return
  }

  if (pendingContexts.length === 0) {
    for (const group of groups) {
      blocks.push({
        type: 'text',
        text: group.text,
      })
    }
    return
  }

  if (pendingContexts.length === 1) {
    const [context] = pendingContexts
    const mergedHits = groups.flatMap(group => group.hits)
    const mergedText = groups
      .map(group => group.text)
      .filter(text => text.trim())
      .join('\n')

    if (mergedText.trim()) {
      blocks.push({
        type: 'text',
        text: mergedText,
      })
    }

    pushSearchResult(blocks, progressEvents, context, mergedHits)
    return
  }

  if (groups.length <= pendingContexts.length) {
    const unmatchedCount = pendingContexts.length - groups.length
    for (const context of pendingContexts.slice(0, unmatchedCount)) {
      pushSearchResult(blocks, progressEvents, context, [])
    }

    const mappedContexts = pendingContexts.slice(unmatchedCount)
    for (let index = 0; index < mappedContexts.length; index += 1) {
      const context = mappedContexts[index]
      const group = groups[index]
      if (group.text.trim()) {
        blocks.push({
          type: 'text',
          text: group.text,
        })
      }
      pushSearchResult(blocks, progressEvents, context, group.hits)
    }
    return
  }

  const leadingContexts = pendingContexts.slice(0, -1)
  for (let index = 0; index < leadingContexts.length; index += 1) {
    const context = leadingContexts[index]
    const group = groups[index]
    if (group.text.trim()) {
      blocks.push({
        type: 'text',
        text: group.text,
      })
    }
    pushSearchResult(blocks, progressEvents, context, group.hits)
  }

  const trailingContext = pendingContexts.at(-1)
  if (!trailingContext) {
    return
  }

  const trailingGroups = groups.slice(leadingContexts.length)
  const mergedText = trailingGroups
    .map(group => group.text)
    .filter(text => text.trim())
    .join('\n')
  if (mergedText.trim()) {
    blocks.push({
      type: 'text',
      text: mergedText,
    })
  }
  pushSearchResult(
    blocks,
    progressEvents,
    trailingContext,
    trailingGroups.flatMap(group => group.hits),
  )
}

function normalizeCitationHits(annotations: ResponsesUrlCitation[] | undefined): SearchResponseHit[] {
  const hits: SearchResponseHit[] = []

  for (const annotation of annotations ?? []) {
    if (annotation?.type !== 'url_citation') {
      continue
    }

    const url = typeof annotation.url === 'string' ? annotation.url.trim() : ''
    if (!url) {
      continue
    }

    const title =
      typeof annotation.title === 'string' && annotation.title.trim()
        ? annotation.title.trim()
        : url

    hits.push({ title, url })
  }

  return hits
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
  const pendingCompletedToolUseIds = new Set<string>()
  const pendingCompletedSearches: PendingSearchContext[] = []
  let lastSearchToolUseId: string | null = null
  let sawMessageText = false

  for (const item of turnItems) {
    if (item.kind !== 'raw_model_output') {
      continue
    }

    const payload = item.payload as
      | ResponsesWebSearchCallItem
      | ResponsesMessageItem
      | undefined

    if (payload?.type === 'web_search_call') {
      const toolUseId = payload.id?.trim() || `web-search-${seenQueryByToolUseId.size + 1}`
      const query = getWebSearchQuery(payload.action) || fallbackQuery
      lastSearchToolUseId = toolUseId

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

      if (payload.status === 'completed' && !pendingCompletedToolUseIds.has(toolUseId)) {
        pendingCompletedToolUseIds.add(toolUseId)
        pendingCompletedSearches.push({
          toolUseId,
          query,
        })
      }
      continue
    }

    if (payload?.type !== 'message' || payload.role !== 'assistant') {
      continue
    }

    const fallbackToolUseId =
      lastSearchToolUseId || `web-search-${seenQueryByToolUseId.size + 1}`
    const fallbackQueryForMessage =
      seenQueryByToolUseId.get(fallbackToolUseId) || fallbackQuery
    const citationGroups: CitationGroup[] = []

    for (const part of payload.content ?? []) {
      if (part?.type !== 'output_text') {
        continue
      }

      const textValue = typeof part.text === 'string' ? part.text : ''
      const hits = normalizeCitationHits(part.annotations)
      if (hits.length > 0) {
        sawMessageText = true
        citationGroups.push({
          text: textValue,
          hits,
        })
        continue
      }

      if (textValue.trim()) {
        sawMessageText = true
        blocks.push({
          type: 'text',
          text: textValue,
        })
      }
    }

    const pendingContexts = pendingCompletedSearches.splice(0)
    for (const context of pendingContexts) {
      pendingCompletedToolUseIds.delete(context.toolUseId)
    }

    if (citationGroups.length > 0) {
      flushCitationGroups(
        citationGroups,
        pendingContexts.length > 0
          ? pendingContexts
          : [
              {
                toolUseId: fallbackToolUseId,
                query: fallbackQueryForMessage,
              },
            ],
        blocks,
        progressEvents,
      )
    } else {
      for (const context of pendingContexts) {
        pushSearchResult(blocks, progressEvents, context, [])
      }
    }
  }

  for (const toolUseId of pendingCompletedToolUseIds) {
    const query = seenQueryByToolUseId.get(toolUseId) || fallbackQuery
    pushSearchResult(blocks, progressEvents, { toolUseId, query }, [])
  }

  if (!sawMessageText) {
    for (const item of turnItems) {
      if (item.kind === 'final_answer' && item.text.trim()) {
        blocks.push({
          type: 'text',
          text: item.text,
        })
      }
    }
  }

  return { blocks, progressEvents }
}

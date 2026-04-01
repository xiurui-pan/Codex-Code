import test from 'node:test'
import assert from 'node:assert/strict'
import { collectCodexWebSearchResponse } from '../src/tools/WebSearchTool/codexWebSearchResponse.js'

test('web search response parsing reads completed web_search_call items from raw model output', () => {
  const result = collectCodexWebSearchResponse(
    [
      {
        kind: 'raw_model_output',
        provider: 'custom',
        itemType: 'web_search_call',
        payload: {
          type: 'web_search_call',
          id: 'ws-1',
          status: 'completed',
          action: {
            type: 'search',
            query: 'codex cli web search',
          },
        },
      },
      {
        kind: 'final_answer',
        provider: 'custom',
        text: 'search summary',
        source: 'message_output',
      },
    ],
    'fallback query',
  )

  assert.deepEqual(result.progressEvents, [
    {
      toolUseID: 'ws-1',
      data: {
        type: 'query_update',
        query: 'codex cli web search',
      },
    },
    {
      toolUseID: 'ws-1',
      data: {
        type: 'search_results_received',
        resultCount: 0,
        query: 'codex cli web search',
      },
    },
  ])
  assert.deepEqual(result.blocks, [
    {
      type: 'search_call',
      toolUseId: 'ws-1',
      query: 'codex cli web search',
    },
    {
      type: 'search_result',
      toolUseId: 'ws-1',
      query: 'codex cli web search',
      resultCount: 0,
    },
    {
      type: 'text',
      text: 'search summary',
    },
  ])
})

test('web search response parsing falls back to the requested query when action details are missing', () => {
  const result = collectCodexWebSearchResponse(
    [
      {
        kind: 'raw_model_output',
        provider: 'custom',
        itemType: 'web_search_call',
        payload: {
          type: 'web_search_call',
          id: 'ws-2',
          status: 'completed',
        },
      },
    ],
    'fallback query',
  )

  assert.equal(result.progressEvents[0]?.data.query, 'fallback query')
  assert.equal(result.progressEvents[1]?.data.type, 'search_results_received')
})

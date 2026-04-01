import test from 'node:test'
import assert from 'node:assert/strict'
import { collectCodexWebSearchResponse } from '../src/tools/WebSearchTool/codexWebSearchResponse.js'

import { formatWebSearchToolResultContent } from '../src/tools/WebSearchTool/codexWebSearchFormatting.js'

test('web search response parsing keeps citation links from assistant message content', () => {
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
        kind: 'raw_model_output',
        provider: 'custom',
        itemType: 'message',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Found a relevant result.',
              annotations: [
                {
                  type: 'url_citation',
                  title: 'OpenAI Codex',
                  url: 'https://openai.com/codex',
                },
              ],
            },
          ],
        },
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
        resultCount: 1,
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
      type: 'text',
      text: 'Found a relevant result.',
    },
    {
      type: 'search_result',
      toolUseId: 'ws-1',
      query: 'codex cli web search',
      hits: [
        {
          title: 'OpenAI Codex',
          url: 'https://openai.com/codex',
        },
      ],
    },
  ])

  const toolResultContent = formatWebSearchToolResultContent({
    query: 'codex cli web search',
    results: [
      {
        tool_use_id: 'ws-1',
        content: [
          {
            title: 'OpenAI Codex',
            url: 'https://openai.com/codex',
          },
        ],
      },
    ],
    durationSeconds: 1,
  })

  assert.equal(toolResultContent.includes('https://openai.com/codex'), true)
  assert.equal(toolResultContent.includes('OpenAI Codex'), true)
  assert.equal(toolResultContent.includes('No links found.'), false)
})


test('web search response parsing keeps multiple search result citations on their own tool use ids', () => {
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
          action: { type: 'search', query: 'first query' },
        },
      },
      {
        kind: 'raw_model_output',
        provider: 'custom',
        itemType: 'web_search_call',
        payload: {
          type: 'web_search_call',
          id: 'ws-2',
          status: 'completed',
          action: { type: 'search', query: 'second query' },
        },
      },
      {
        kind: 'raw_model_output',
        provider: 'custom',
        itemType: 'message',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'First result.',
              annotations: [
                {
                  type: 'url_citation',
                  title: 'First Link',
                  url: 'https://example.com/first',
                },
              ],
            },
            {
              type: 'output_text',
              text: 'Second result.',
              annotations: [
                {
                  type: 'url_citation',
                  title: 'Second Link',
                  url: 'https://example.com/second',
                },
              ],
            },
          ],
        },
      },
    ],
    'fallback query',
  )

  const searchResults = result.blocks.filter(block => block.type === 'search_result')
  assert.deepEqual(searchResults, [
    {
      type: 'search_result',
      toolUseId: 'ws-1',
      query: 'first query',
      hits: [{ title: 'First Link', url: 'https://example.com/first' }],
    },
    {
      type: 'search_result',
      toolUseId: 'ws-2',
      query: 'second query',
      hits: [{ title: 'Second Link', url: 'https://example.com/second' }],
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

import type { Output, SearchResult } from './WebSearchTool.js'

function stableJson(value: unknown): string {
  return JSON.stringify(value)
}

export function formatWebSearchToolResultContent(output: Output): string {
  const { query, results } = output

  let formattedOutput = `Web search results for query: "${query}"\n\n`

  for (const result of results ?? []) {
    if (result == null) {
      continue
    }
    if (typeof result === 'string') {
      formattedOutput += result + '\n\n'
      continue
    }

    const searchResult = result as SearchResult
    if (searchResult.content?.length > 0) {
      formattedOutput += `Links: ${stableJson(searchResult.content)}\n\n`
    } else {
      formattedOutput += 'No links found.\n\n'
    }
  }

  formattedOutput +=
    '\nREMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.'

  return formattedOutput.trim()
}

export type UsageIteration = {
  input_tokens?: number | null
  output_tokens?: number | null
  type?: string | null
  model?: string | null
  [key: string]: unknown
}

export type NonNullableUsage = {
  input_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  output_tokens: number
  server_tool_use: {
    web_search_requests: number
    web_fetch_requests: number
  }
  service_tier: string | null
  cache_creation: {
    ephemeral_1h_input_tokens: number
    ephemeral_5m_input_tokens: number
  }
  inference_geo: string | null
  iterations: UsageIteration[] | null
  speed: string | null
}

export type StatusLineCommandInput = {
  session_id?: string
  session_name?: string
  transcript_path?: string
  cwd?: string
  model?: {
    id: string
    display_name: string
  }
  workspace?: {
    current_dir: string
    project_dir: string
    added_dirs: string[]
  }
  version?: string
  output_style?: {
    name: string
  }
  cost?: {
    billing_available?: boolean
    total_cost_usd: number
    today_cost_usd: number
    total_duration_ms: number
    total_api_duration_ms: number
    total_lines_added: number
    total_lines_removed: number
  }
  context_window?: {
    total_input_tokens: number
    total_output_tokens: number
    context_window_size: number
    current_tokens?: number
    current_usage: {
      input_tokens: number
      output_tokens: number
      cache_creation_input_tokens: number
      cache_read_input_tokens: number
    } | null
    used_percentage: number | null
    remaining_percentage: number | null
  }
  token_usage?: {
    used_tokens: number
    total_input_tokens: number
    total_output_tokens: number
    cached_input_tokens: number
    uncached_input_tokens: number
  }
  exceeds_200k_tokens?: boolean
  rate_limits?: {
    five_hour?: {
      used_percentage: number
      resets_at: number
    }
    seven_day?: {
      used_percentage: number
      resets_at: number
    }
  }
  vim?: {
    mode: string
  }
  agent?: {
    name: string
    type?: string
  }
  remote?: {
    session_id: string
  }
  worktree?: {
    name: string
    path: string
    branch?: string
    original_cwd: string
    original_branch?: string
  }
  [key: string]: unknown
}

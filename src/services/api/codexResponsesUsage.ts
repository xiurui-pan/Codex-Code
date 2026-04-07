import { addToTotalSessionCost } from '../../cost-tracker.js'
import { isCurrentPhaseCustomCodexProvider } from '../../utils/currentPhase.js'
import { calculateUSDCost } from '../../utils/modelCost.js'

type ResponsesCompletedUsage = {
  input_tokens: number
  input_tokens_details?: {
    cached_tokens?: number
  }
  output_tokens: number
  output_tokens_details?: {
    reasoning_tokens?: number
  }
  total_tokens: number
}

/**
 * Convert OpenAI Responses API usage to Anthropic Usage format and track cost.
 * The OpenAI Responses API returns usage in a different format than Anthropic's:
 * - input_tokens → input_tokens
 * - input_tokens_details.cached_tokens → cache_read_input_tokens
 * - output_tokens → output_tokens
 * - output_tokens_details.reasoning_tokens → (no direct mapping, included in output)
 */
export function convertResponsesUsageToAnthropicAndTrack(
  responsesUsage: ResponsesCompletedUsage,
  model?: string,
): void {
  const resolvedModel = model ?? 'unknown'

  const anthropicUsage = {
    input_tokens: responsesUsage.input_tokens ?? 0,
    output_tokens: responsesUsage.output_tokens ?? 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: responsesUsage.input_tokens_details?.cached_tokens ?? 0,
    server_tool_use: undefined,
  }

  const costUSD = isCurrentPhaseCustomCodexProvider()
    ? 0
    : calculateUSDCost(resolvedModel, anthropicUsage)
  addToTotalSessionCost(costUSD, anthropicUsage, resolvedModel)
}

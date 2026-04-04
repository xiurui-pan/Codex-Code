import { createRequire } from 'node:module'
import { isEnvTruthy } from './envUtils.js'

const require = createRequire(import.meta.url)
const currentPhaseDisableLegacyAgentSwarms = process.env.CODEX_CODE_USE_CODEX_PROVIDER === '1'

function getFeatureValue_CACHED_MAY_BE_STALE<T>(feature: string, fallback: T): T {
  if (currentPhaseDisableLegacyAgentSwarms) return fallback
  return (require('../services/analytics/growthbook.js') as typeof import('../services/analytics/growthbook.js')).getFeatureValue_CACHED_MAY_BE_STALE(feature, fallback)
}

/**
 * Check if --agent-teams flag is provided via CLI.
 * Checks process.argv directly to avoid import cycles with bootstrap/state.
 * Note: The flag is only shown in help for ant users, but if external users
 * pass it anyway, it will work (subject to the killswitch).
 */
function isAgentTeamsFlagSet(): boolean {
  return process.argv.includes('--agent-teams')
}

/**
 * Centralized runtime check for agent teams/teammate features.
 * This is the single gate that should be checked everywhere teammates
 * are referenced (prompts, code, tools isEnabled, UI, etc.).
 *
 * Ant builds: always enabled.
 * External builds require both:
 * 1. Opt-in via CODEX_CODE_EXPERIMENTAL_AGENT_TEAMS env var OR --agent-teams flag
 * 2. GrowthBook gate 'tengu_amber_flint' enabled (killswitch)
 */
export function isAgentSwarmsEnabled(): boolean {
  // Ant: always on
  if (process.env.USER_TYPE === 'ant') {
    return true
  }

  // External: require opt-in via env var or --agent-teams flag
  if (
    !isEnvTruthy(process.env.CODEX_CODE_EXPERIMENTAL_AGENT_TEAMS) &&
    !isAgentTeamsFlagSet()
  ) {
    return false
  }

  // Killswitch — always respected for external users
  if (!getFeatureValue_CACHED_MAY_BE_STALE('tengu_amber_flint', true)) {
    return false
  }

  return true
}

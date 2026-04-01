import { initializeErrorLogSink } from './errorLogSink.js'
import { isCurrentPhaseCustomCodexProvider } from './currentPhase.js'

/**
 * Attach error log and analytics sinks, draining any events queued before
 * attachment. Both inits are idempotent. Called from setup() for the default
 * command; other entrypoints (subcommands, daemon, bridge) call this directly
 * since they bypass setup().
 *
 * Leaf module — kept out of setup.ts to avoid the setup → commands → bridge
 * → setup import cycle.
 */
export function initSinks(): void {
  initializeErrorLogSink()

  if (isCurrentPhaseCustomCodexProvider()) {
    return
  }

  void import('../services/analytics/sink.js').then(m =>
    m.initializeAnalyticsSink(),
  )
}

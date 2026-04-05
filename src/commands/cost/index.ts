/**
 * Cost command - minimal metadata only.
 * Implementation is lazy-loaded from cost.ts to reduce startup time.
 */
import type { Command } from '../../commands.js'
import { createRequire } from 'node:module'
import { isCurrentPhaseCustomCodexProvider } from '../../utils/currentPhase.js'

const require = createRequire(import.meta.url)
const shouldHideCostForSubscriber = isCurrentPhaseCustomCodexProvider()
  ? () => false
  : () =>
      (require('../../utils/auth.js') as typeof import('../../utils/auth.js'))
        .isClaudeAISubscriber()

const cost = {
  type: 'local',
  name: 'cost',
  description: 'Show the total cost and duration of the current session',
  get isHidden() {
    // Keep visible for Ants even if they're subscribers (they see cost breakdowns)
    if (process.env.USER_TYPE === 'ant') {
      return false
    }
    return shouldHideCostForSubscriber()
  },
  supportsNonInteractive: true,
  load: () => import('./cost.js'),
} satisfies Command

export default cost

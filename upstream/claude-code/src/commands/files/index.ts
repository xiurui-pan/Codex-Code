import type { Command } from '../../commands.js'
import { isCurrentPhaseCustomCodexProvider } from '../../utils/currentPhase.js'

const files = {
  type: 'local',
  name: 'files',
  description: 'List all files currently in context',
  isEnabled: () =>
    process.env.USER_TYPE === 'ant' || isCurrentPhaseCustomCodexProvider(),
  supportsNonInteractive: true,
  load: () => import('./files.js'),
} satisfies Command

export default files

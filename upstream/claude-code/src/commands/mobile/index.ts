import type { Command } from '../../commands.js'
import { isCurrentPhaseCustomCodexProvider } from '../../utils/currentPhase.js'

const mobile = {
  type: 'local-jsx',
  name: 'mobile',
  aliases: ['ios', 'android'],
  description: 'Show QR code to download the Claude mobile app',
  isEnabled: () => !isCurrentPhaseCustomCodexProvider(),
  get isHidden() {
    return isCurrentPhaseCustomCodexProvider()
  },
  load: () => import('./mobile.js'),
} satisfies Command

export default mobile

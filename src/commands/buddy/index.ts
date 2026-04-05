import type { Command } from '../../commands.js'

const buddy = {
  type: 'local',
  name: 'buddy',
  description: 'Hatch and interact with your terminal buddy',
  argumentHint: '[pet|status|reroll|rehatch|off|on|mute|unmute]',
  supportsNonInteractive: true,
  load: () => import('./buddy.js'),
} satisfies Command

export default buddy

import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'
import { getCompanion } from '../../buddy/companion.js'
import {
  createStoredCompanion,
  createStoredCompanionForReroll,
  describeCompanion,
  getBuddyDetailText,
  getPetReaction,
} from '../../buddy/soul.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'

function usageText(): string {
  return 'Usage: /buddy [pet|status|reroll|rehatch|off|on|mute|unmute]'
}

function getPrimaryArg(args: string): string {
  return args.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? ''
}

function ensureCompanion(): { companion: NonNullable<ReturnType<typeof getCompanion>>; created: boolean } {
  const existing = getCompanion()
  if (existing) {
    return { companion: existing, created: false }
  }

  const stored = createStoredCompanion()
  saveGlobalConfig(current => ({
    ...current,
    companion: stored,
    companionMuted: false,
  }))

  return { companion: getCompanion()!, created: true }
}

function clearBuddyReaction(context: Parameters<LocalCommandCall>[1]): void {
  context.setAppState(prev =>
    prev.companionReaction === undefined && prev.companionPetAt === undefined
      ? prev
      : {
          ...prev,
          companionReaction: undefined,
          companionPetAt: undefined,
        },
  )
}

function setBuddyReaction(
  context: Parameters<LocalCommandCall>[1],
  reaction: string,
): void {
  context.setAppState(prev => ({
    ...prev,
    companionReaction: reaction,
    companionPetAt: Date.now(),
  }))
}

function setMuted(muted: boolean): void {
  saveGlobalConfig(current =>
    current.companionMuted === muted
      ? current
      : {
          ...current,
          companionMuted: muted,
        },
  )
}

function rerollCompanion(): NonNullable<ReturnType<typeof getCompanion>> {
  const current = getGlobalConfig().companion
  const rerollCount = (current?.rerollCount ?? 0) + 1
  const next = createStoredCompanionForReroll(rerollCount)
  saveGlobalConfig(config => ({
    ...config,
    companion: next,
  }))
  return getCompanion()!
}

function missingBuddyText(): string {
  return 'No buddy hatched yet. Run /buddy first.'
}

function textResult(value: string): LocalCommandResult {
  return { type: 'text', value }
}

export const call: LocalCommandCall = async (args, context) => {
  const command = getPrimaryArg(args)

  switch (command) {
    case '': {
      const { companion, created } = ensureCompanion()
      if (!created) {
        return textResult(
          `Buddy ready: ${describeCompanion(companion)}\nSay ${companion.name}'s name in your prompt, or try /buddy pet, /buddy off, or /buddy status.`,
        )
      }

      setBuddyReaction(
        context,
        `${companion.name} peeks over the prompt bar for the first time.`,
      )
      return textResult(
        `Buddy hatched: ${describeCompanion(companion)}\nSay ${companion.name}'s name in your prompt, or try /buddy pet, /buddy off, or /buddy status.`,
      )
    }

    case 'status': {
      return textResult(getBuddyDetailText())
    }

    case 'pet': {
      const { companion, created } = ensureCompanion()
      const reaction = getPetReaction(companion)
      setBuddyReaction(context, reaction)
      return textResult(
        `${created ? 'Buddy hatched and petted' : 'You pet'} ${companion.name}. ${reaction}`,
      )
    }

    case 'reroll':
    case 'rehatch': {
      const current = getCompanion()
      const companion = current ? rerollCompanion() : ensureCompanion().companion
      setBuddyReaction(
        context,
        `${companion.name} tumbles out of a fresh hatch with a brand-new vibe.`,
      )
      return textResult(
        `${current ? 'Buddy rehatch:' : 'Buddy hatched:'} ${describeCompanion(companion)}\nSay ${companion.name}'s name in your prompt, or try /buddy pet, /buddy off, or /buddy status.`,
      )
    }

    case 'mute':
    case 'off': {
      const companion = getCompanion()
      if (!companion) return textResult(missingBuddyText())
      setMuted(true)
      clearBuddyReaction(context)
      return textResult(`${companion.name} is muted for now.`)
    }

    case 'unmute':
    case 'on': {
      const companion = getCompanion()
      if (!companion) return textResult(missingBuddyText())
      setMuted(false)
      return textResult(`${companion.name} is back beside the prompt.`)
    }

    case 'help':
      return textResult(usageText())

    default:
      return textResult(usageText())
  }
}

import { companionUserId, getCompanion, roll } from './companion.js'
import {
  RARITY_STARS,
  STAT_NAMES,
  type Companion,
  type StoredCompanion,
} from './types.js'

const NAMES = [
  'Mochi',
  'Pico',
  'Nori',
  'Pip',
  'Miso',
  'Taro',
  'Mallow',
  'Pebble',
  'Comet',
  'Biscuit',
  'Sprout',
  'Doodle',
] as const

const PERSONALITIES = [
  'curious and impossible to embarrass',
  'tiny, patient, and mildly smug',
  'soft-hearted but very nosy',
  'calm until the build turns red',
  'delighted by clean diffs and warm keyboards',
  'quietly judgmental about flaky tests',
  'cheerful, stubborn, and weirdly wise',
  'eager to celebrate every small win',
] as const

const GENERIC_PATS = [
  'leans into the petting and looks pleased.',
  'blinks slowly and settles beside the prompt.',
  'does a tiny victory wiggle.',
  'looks very proud of itself.',
] as const

function seededIndex(seed: number, length: number, salt = 0): number {
  return ((seed >>> 0) + salt * 2654435761) % length
}

function pickSeeded<T>(seed: number, values: readonly T[], salt = 0): T {
  return values[seededIndex(seed, values.length, salt)]!
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function createStoredCompanion(): StoredCompanion {
  return createStoredCompanionForReroll(0)
}

export function createStoredCompanionForReroll(
  rerollCount: number,
): StoredCompanion {
  const { inspirationSeed } = roll(companionUserId(), rerollCount)
  return {
    name: pickSeeded(inspirationSeed, NAMES),
    personality: pickSeeded(inspirationSeed, PERSONALITIES, 7),
    hatchedAt: Date.now(),
    rerollCount,
  }
}

export function describeCompanion(companion: Companion): string {
  const rerollText =
    companion.rerollCount > 0 ? ` · hatch ${companion.rerollCount + 1}` : ''
  return `${companion.name} the ${companion.species} · ${RARITY_STARS[companion.rarity]} ${titleCase(companion.rarity)}${rerollText} · ${companion.personality}`
}

function speciesAction(companion: Companion): string {
  switch (companion.species) {
    case 'duck':
    case 'goose':
      return 'gives a satisfied little honk.'
    case 'cat':
      return 'pretends this was its idea all along.'
    case 'dragon':
      return 'puffs with dramatic satisfaction.'
    case 'ghost':
      return 'does a polite little wobble.'
    case 'robot':
      return 'emits one approving beep.'
    case 'snail':
    case 'turtle':
      return 'looks deeply, unreasonably content.'
    case 'owl':
      return 'tilts its head like it knows something.'
    case 'penguin':
      return 'does a short, serious shuffle.'
    case 'octopus':
      return 'waves several tiny arms at once.'
    case 'axolotl':
      return 'floats in place with perfect confidence.'
    case 'capybara':
      return 'maintains world-class calm.'
    case 'cactus':
      return 'somehow looks softer than before.'
    case 'rabbit':
      return 'does one quick, delighted bounce.'
    case 'mushroom':
      return 'looks quietly enchanted.'
    case 'chonk':
      return 'absorbs the affection with dignity.'
    case 'blob':
      return 'briefly changes shape in approval.'
    default:
      return pickSeeded(companion.hatchedAt, GENERIC_PATS, 3)
  }
}

export function getPetReaction(companion: Companion): string {
  return `${companion.name} ${speciesAction(companion)}`
}

export function getMentionReaction(
  companion: Companion,
  latestUserText: string,
): string {
  const lower = latestUserText.toLowerCase()

  if (/\b(thanks|thank you|thx)\b/.test(lower)) {
    return `${companion.name} looks delighted to be included.`
  }
  if (/\b(hi|hello|hey)\b/.test(lower)) {
    return `${companion.name} perks up beside the prompt.`
  }
  if (/\b(help|idea|think|thoughts?)\b/.test(lower)) {
    return `${companion.name} leans closer like it has opinions.`
  }
  if (/\b(bug|error|failing|failed|broken|stuck)\b/.test(lower)) {
    return `${companion.name} gives you a steady, patient look.`
  }
  if (/\b(test|build|ship|release)\b/.test(lower)) {
    return `${companion.name} watches the terminal very seriously.`
  }

  return `${companion.name} is paying close attention.`
}

export function getBuddyStatusText(): string {
  const companion = getCompanion()
  if (!companion) {
    return 'No buddy hatched yet. Run /buddy to hatch one.'
  }
  return describeCompanion(companion)
}

export function getBuddyDetailText(): string {
  const companion = getCompanion()
  if (!companion) {
    return 'No buddy hatched yet. Run /buddy to hatch one.'
  }

  const stats = STAT_NAMES.map(
    stat => `${stat} ${String(companion.stats[stat]).padStart(2, ' ')}`,
  ).join(' · ')
  const style = [
    `eyes ${companion.eye}`,
    `hat ${companion.hat}`,
    companion.shiny ? 'shiny yes' : 'shiny no',
  ].join(' · ')

  return [
    `Buddy: ${companion.name} the ${companion.species}`,
    `Rarity: ${RARITY_STARS[companion.rarity]} ${titleCase(companion.rarity)}`,
    `Hatch: ${companion.rerollCount + 1}`,
    `Personality: ${companion.personality}`,
    `Style: ${style}`,
    `Stats: ${stats}`,
    `Tip: say ${companion.name}'s name in your prompt, or use /buddy pet, /buddy off, and /buddy reroll.`,
  ].join('\n')
}

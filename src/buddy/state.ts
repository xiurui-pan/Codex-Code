import { feature } from 'bun:bundle'
import { getGlobalConfig } from '../utils/config.js'
import { getCompanion } from './companion.js'
import type { Companion } from './types.js'

export type BuddyState = {
  featureEnabled: boolean
  companion: Companion | undefined
  muted: boolean
  hatched: boolean
  visible: boolean
}

export function getBuddyState(): BuddyState {
  const featureEnabled = feature('BUDDY')
  const companion = featureEnabled ? getCompanion() : undefined
  const muted = featureEnabled ? getGlobalConfig().companionMuted === true : false
  const hatched = companion !== undefined

  return {
    featureEnabled,
    companion,
    muted,
    hatched,
    visible: hatched && !muted,
  }
}

export function isBuddyFeatureEnabled(): boolean {
  return getBuddyState().featureEnabled
}

export function isBuddyVisible(): boolean {
  return getBuddyState().visible
}

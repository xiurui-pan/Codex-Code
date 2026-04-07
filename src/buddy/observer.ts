import type { Message } from '../types/message.js'
import {
  getAssistantMessageText,
  getUserMessageText,
} from '../utils/messages.js'
import { escapeRegExp } from '../utils/stringUtils.js'
import { getMentionReaction } from './soul.js'
import { getBuddyState } from './state.js'

function getLastVisibleUserMessage(messages: readonly Message[]): Message | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.type === 'user' && !message.isMeta) {
      return message
    }
  }
  return null
}

function getLastAssistantMessage(messages: readonly Message[]): Message | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.type === 'assistant' && !message.isMeta) {
      return message
    }
  }
  return null
}

export function fireCompanionObserver(
  messages: readonly Message[],
  onReaction: (reaction: string | undefined) => void,
): void {
  const { companion, visible } = getBuddyState()
  if (!visible || !companion) return

  const latestUser = getLastVisibleUserMessage(messages)
  const latestUserText = latestUser ? getUserMessageText(latestUser) : null
  if (!latestUserText) return

  const directMention = new RegExp(
    `\\b${escapeRegExp(companion.name.toLowerCase())}\\b`,
    'i',
  )
  if (!directMention.test(latestUserText.toLowerCase())) {
    return
  }

  const latestAssistant = getLastAssistantMessage(messages)
  const latestAssistantText = latestAssistant
    ? getAssistantMessageText(latestAssistant)
    : null

  if (latestAssistantText?.trim() === '') {
    return
  }

  onReaction(getMentionReaction(companion, latestUserText))
}

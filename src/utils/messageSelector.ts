import {
  BASH_STDERR_TAG,
  BASH_STDOUT_TAG,
  LOCAL_COMMAND_STDERR_TAG,
  LOCAL_COMMAND_STDOUT_TAG,
  TASK_NOTIFICATION_TAG,
  TEAMMATE_MESSAGE_TAG,
  TICK_TAG,
} from '../constants/xml.js'
import type { Message, UserMessage } from '../types/message.js'
import { isSyntheticMessage } from './messages.js'

function getRenderableUserMessageText(message: UserMessage): string {
  const content = message.message.content
  if (typeof content === 'string') {
    return content.trim()
  }

  const lastBlock = content[content.length - 1]
  if (
    lastBlock &&
    lastBlock.type === 'text' &&
    typeof lastBlock.text === 'string'
  ) {
    return lastBlock.text.trim()
  }

  return ''
}

export function selectableUserMessagesFilter(
  message: Message,
): message is UserMessage {
  if (message.type !== 'user') {
    return false
  }
  if (
    Array.isArray(message.message.content) &&
    message.message.content[0]?.type === 'tool_result'
  ) {
    return false
  }
  if (isSyntheticMessage(message)) {
    return false
  }
  if (message.isMeta) {
    return false
  }
  if (message.isCompactSummary || message.isVisibleInTranscriptOnly) {
    return false
  }

  const messageText = getRenderableUserMessageText(message)

  if (
    messageText.includes(`<${LOCAL_COMMAND_STDOUT_TAG}>`) ||
    messageText.includes(`<${LOCAL_COMMAND_STDERR_TAG}>`) ||
    messageText.includes(`<${BASH_STDOUT_TAG}>`) ||
    messageText.includes(`<${BASH_STDERR_TAG}>`) ||
    messageText.includes(`<${TASK_NOTIFICATION_TAG}>`) ||
    messageText.includes(`<${TICK_TAG}>`) ||
    messageText.includes(`<${TEAMMATE_MESSAGE_TAG}`)
  ) {
    return false
  }

  return true
}

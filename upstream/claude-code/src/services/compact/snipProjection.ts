import type { Message } from '../../types/message.js'

export function isSnipBoundaryMessage(_message: Message): boolean {
  return false
}

export function projectSnippedView(messages: Message[]): Message[] {
  return messages
}

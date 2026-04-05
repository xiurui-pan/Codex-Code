import { randomUUID } from 'crypto'
import type { QuerySource } from '../../constants/querySource.js'
import type { Message, UserMessage } from '../../types/message.js'
import { createUserMessage } from '../../utils/messages.js'
import { getSessionMemoryPath } from '../../utils/permissions/filesystem.js'
import { isSessionMemoryEmpty } from './prompts.js'
import { getSessionMemoryContent } from './sessionMemoryUtils.js'
import {
  type CurrentSessionMemoryContextItem,
  createCurrentSessionMemoryContextItem,
  getCurrentSessionMemoryContextItems,
  getCurrentSessionMemoryInheritance,
  isCodexSessionMemoryEnabled,
  shouldIncludeCurrentSessionMemory,
} from './sessionMemoryContextRules.js'

export {
  createCurrentSessionMemoryContextItem,
  getCurrentSessionMemoryContextItems,
  getCurrentSessionMemoryInheritance,
  isCodexSessionMemoryEnabled,
  shouldIncludeCurrentSessionMemory,
}
export type { CurrentSessionMemoryContextItem }

export function createCurrentSessionMemoryContextMessage(
  item: CurrentSessionMemoryContextItem,
): UserMessage {
  return {
    ...createUserMessage({
      content:
        `Current session memory from ${item.path}:\n\n${item.content}` +
        '\n\nUse this summary to stay consistent with the active session state and any resumed work.',
      isMeta: true,
    }),
    uuid: randomUUID(),
  }
}

export function isCurrentSessionMemoryContextMessage(
  message: Message,
): boolean {
  return (
    message.type === 'user' &&
    message.isMeta === true &&
    Array.isArray(message.message.content) &&
    message.message.content.some(
      block =>
        block.type === 'text' &&
        typeof block.text === 'string' &&
        block.text.startsWith('Current session memory from '),
    )
  )
}

export async function getCurrentSessionMemoryContextMessages(
  querySource: QuerySource | undefined,
): Promise<UserMessage[]> {
  const items = await getCurrentSessionMemoryContextItems({
    querySource,
    content: await getSessionMemoryContent(),
    path: getSessionMemoryPath(),
    isEmpty: isSessionMemoryEmpty,
  })
  return items.map(createCurrentSessionMemoryContextMessage)
}

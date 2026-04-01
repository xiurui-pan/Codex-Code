import type { ModelTurnItem } from '../services/api/modelTurnItems.js'
import { extractFinalAnswerTextFromTurnItems } from '../services/api/modelTurnItems.js'

export function getPlainAssistantTextFromTurnItems(
  turnItems: readonly ModelTurnItem[],
): string | null {
  if (turnItems.some(item => item.kind === 'tool_call')) {
    return null
  }

  const finalAnswerText = extractFinalAnswerTextFromTurnItems(turnItems)
  return finalAnswerText || null
}

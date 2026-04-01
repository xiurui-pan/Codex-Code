import type { ModelTurnItem } from '../api/modelTurnItems.js'
import { extractFinalAnswerTextFromTurnItems } from '../api/modelTurnItems.js'

export function getCompactSummaryText(options: {
  assistantText: string | null
  modelTurnItems?: readonly ModelTurnItem[] | null
}): string | null {
  const turnItemText = options.modelTurnItems?.length
    ? extractFinalAnswerTextFromTurnItems(options.modelTurnItems).trim()
    : ''

  if (turnItemText) {
    return turnItemText
  }

  return options.assistantText
}

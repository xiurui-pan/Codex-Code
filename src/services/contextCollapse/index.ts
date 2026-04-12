import type { Message } from '../../types/message.js'

type ContextCollapseStats = {
  collapsedSpans: number
  collapsedMessages: number
  stagedSpans: number
  health: {
    totalSpawns: number
    totalErrors: number
    lastError?: string
    emptySpawnWarningEmitted: boolean
    totalEmptySpawns: number
  }
}

const listeners = new Set<() => void>()

function createEmptyStats(): ContextCollapseStats {
  return {
    collapsedSpans: 0,
    collapsedMessages: 0,
    stagedSpans: 0,
    health: {
      totalSpawns: 0,
      totalErrors: 0,
      emptySpawnWarningEmitted: false,
      totalEmptySpawns: 0,
    },
  }
}

let stats = createEmptyStats()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function initContextCollapse(): void {}

export function resetContextCollapse(): void {
  stats = createEmptyStats()
  emit()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getStats(): ContextCollapseStats {
  return stats
}

export function isContextCollapseEnabled(): boolean {
  return false
}

export async function applyCollapsesIfNeeded(
  messages: Message[],
  _toolUseContext?: unknown,
  _querySource?: unknown,
): Promise<{ messages: Message[] }> {
  return { messages }
}

export function isWithheldPromptTooLong(_assistantEnvelope: unknown): boolean {
  return false
}

export function recoverFromOverflow(
  messages: Message[],
  _querySource?: unknown,
): { messages: Message[]; committed: number } {
  return { messages, committed: 0 }
}

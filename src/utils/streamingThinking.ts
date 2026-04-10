import type { StreamingThinking } from './messages.js'

export const STREAMING_THINKING_RETENTION_MS = 30_000

export function isStreamingThinkingVisible(
  streamingThinking: StreamingThinking | null | undefined,
  now = Date.now(),
): boolean {
  if (!streamingThinking) {
    return false
  }

  if (streamingThinking.isStreaming) {
    return true
  }

  if (streamingThinking.streamingEndedAt == null) {
    return false
  }

  return now - streamingThinking.streamingEndedAt < STREAMING_THINKING_RETENTION_MS
}

export function getStreamingThinkingHideDelay(
  streamingThinking: StreamingThinking | null | undefined,
  now = Date.now(),
): number | null {
  if (
    !streamingThinking ||
    streamingThinking.isStreaming ||
    streamingThinking.streamingEndedAt == null
  ) {
    return null
  }

  return Math.max(
    0,
    STREAMING_THINKING_RETENTION_MS -
      (now - streamingThinking.streamingEndedAt),
  )
}

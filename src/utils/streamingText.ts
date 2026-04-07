const STREAMING_PREVIEW_MIN_CHARS = 8
const STREAMING_PREVIEW_CHUNK_SIZE = 4
const STABLE_BOUNDARY_REGEX = /[\s,.;:!?)\]}>\u3002\uff0c\uff01\uff1f\uff1b\uff1a]/u

function getLastStableBoundaryIndex(text: string): number {
  let lastBoundaryIndex = -1

  for (let index = 0; index < text.length; index += 1) {
    if (STABLE_BOUNDARY_REGEX.test(text[index]!)) {
      lastBoundaryIndex = index + 1
    }
  }

  return lastBoundaryIndex
}

export function getVisibleStreamingText(
  streamingText: string | null,
  showStreamingText: boolean,
): string | null {
  if (!streamingText || !showStreamingText) {
    return null
  }

  const lastNewlineIndex = streamingText.lastIndexOf('\n')
  if (lastNewlineIndex >= 0) {
    const completedLines = streamingText.slice(0, lastNewlineIndex + 1)
    return completedLines.length > 0 ? completedLines : null
  }

  const lastBoundaryIndex = getLastStableBoundaryIndex(streamingText)
  if (lastBoundaryIndex >= STREAMING_PREVIEW_MIN_CHARS) {
    return streamingText.slice(0, lastBoundaryIndex).trimEnd() || null
  }

  if (streamingText.trim().length < STREAMING_PREVIEW_MIN_CHARS) {
    return null
  }

  const chunkedLength =
    Math.floor(streamingText.length / STREAMING_PREVIEW_CHUNK_SIZE) *
    STREAMING_PREVIEW_CHUNK_SIZE

  if (chunkedLength < STREAMING_PREVIEW_MIN_CHARS) {
    return null
  }

  return streamingText.slice(0, chunkedLength).trimEnd() || null
}

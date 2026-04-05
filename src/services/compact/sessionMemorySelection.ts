import { basename, dirname, join } from 'path'

type SummaryFs = {
  readFile(path: string, options: { encoding: 'utf-8' }): Promise<string>
  readdir(path: string): Promise<Array<{ name: string }>>
  stat(path: string): Promise<{ mtimeMs: number }>
}

export async function findSessionMemorySummaryContent({
  fs,
  transcriptProjectDir,
  currentSessionMemoryPath,
  transcriptSessionMemoryPath,
  isEmpty,
}: {
  fs: SummaryFs
  transcriptProjectDir: string
  currentSessionMemoryPath: string
  transcriptSessionMemoryPath: string
  isEmpty(content: string): Promise<boolean>
}): Promise<string | null> {
  const fallbackCandidatePaths = new Set<string>()

  try {
    const entries = await fs.readdir(transcriptProjectDir)
    for (const entry of entries) {
      const entryName = entry.name
      if (!/^[0-9a-f-]{36}$/i.test(entryName)) {
        continue
      }
      const candidatePath = join(
        transcriptProjectDir,
        entryName,
        'session-memory',
        'summary.md',
      )
      if (
        candidatePath !== currentSessionMemoryPath &&
        candidatePath !== transcriptSessionMemoryPath
      ) {
        fallbackCandidatePaths.add(candidatePath)
      }
    }
  } catch {}

  for (const preferredPath of [
    currentSessionMemoryPath,
    transcriptSessionMemoryPath,
  ]) {
    try {
      const preferredContent = await fs.readFile(preferredPath, {
        encoding: 'utf-8',
      })
      if (preferredContent && !(await isEmpty(preferredContent))) {
        return preferredContent
      }
    } catch {}
  }

  let latestFallbackSummary:
    | {
        content: string
        mtimeMs: number
      }
    | undefined

  for (const candidatePath of fallbackCandidatePaths) {
    try {
      const content = await fs.readFile(candidatePath, { encoding: 'utf-8' })
      if (!content || (await isEmpty(content))) {
        continue
      }
      const stats = await fs.stat(candidatePath)
      if (
        !latestFallbackSummary ||
        stats.mtimeMs > latestFallbackSummary.mtimeMs
      ) {
        latestFallbackSummary = {
          content,
          mtimeMs: stats.mtimeMs,
        }
      }
    } catch {}
  }

  return latestFallbackSummary?.content ?? null
}

export async function findCompactionSessionMemorySummaryContent({
  fs,
  transcriptPath,
  currentSessionMemoryPath,
  isEmpty,
}: {
  fs: SummaryFs
  transcriptPath: string
  currentSessionMemoryPath: string
  isEmpty(content: string): Promise<boolean>
}): Promise<string | null> {
  return findSessionMemorySummaryContent({
    fs,
    transcriptProjectDir: dirname(transcriptPath),
    currentSessionMemoryPath,
    transcriptSessionMemoryPath: join(
      dirname(transcriptPath),
      basename(transcriptPath, '.jsonl'),
      'session-memory',
      'summary.md',
    ),
    isEmpty,
  })
}

import { useContext } from 'react'
import {
  type TerminalSize,
  TerminalSizeContext,
} from '../ink/components/TerminalSizeContext.js'

export function useTerminalSize(): TerminalSize{
  const size = useContext(TerminalSizeContext)

  if (!size) {
    // Fallback for when rendered outside Ink context (e.g., background task status)
    return { columns: process.stdout.columns ?? 120, rows: process.stdout.rows ?? 40 }
  }

  return size
}

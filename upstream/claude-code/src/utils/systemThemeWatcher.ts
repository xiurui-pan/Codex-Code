import type { SystemTheme } from './systemTheme.js'

export function watchSystemTheme(
  _internalQuerier: unknown,
  _setSystemTheme: (theme: SystemTheme) => void,
): () => void {
  return () => {}
}

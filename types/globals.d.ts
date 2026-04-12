declare const MACRO: {
  VERSION: string
  BUILD_TIME?: string
  PACKAGE_URL?: string
  NATIVE_PACKAGE_URL?: string
  VERSION_CHANGELOG?: string
  ISSUES_EXPLAINER?: string
  FEEDBACK_CHANNEL?: string
}

declare const Bun:
  | undefined
  | {
      hash(input: string | ArrayBufferView, seed?: number | bigint): number | bigint
      gc(force?: boolean): void
      stringWidth?(input: string): number
      wrapAnsi?(input: string, width: number, options?: unknown): string
      which?(command: string): string | null
      WebView?: unknown
    }

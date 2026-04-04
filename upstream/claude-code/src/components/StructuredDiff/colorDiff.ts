import { createRequire } from 'module'
import { isEnvDefinedFalsy } from '../../utils/envUtils.js'

const require = createRequire(import.meta.url)

type SyntaxTheme = unknown
type ColorDiffType = unknown
type ColorFileType = unknown

type ColorDiffModuleUnavailableReason = 'env' | 'module'

type ColorDiffRuntimeModule = {
  ColorDiff?: ColorDiffType
  ColorFile?: ColorFileType
  getSyntaxTheme?: (themeName: string) => SyntaxTheme | null
}

let colorDiffRuntimeModule: ColorDiffRuntimeModule | null | undefined

function getColorDiffRuntimeModule(): ColorDiffRuntimeModule | null {
  if (colorDiffRuntimeModule !== undefined) {
    return colorDiffRuntimeModule
  }

  try {
    const loaded = require('color-diff-napi') as ColorDiffRuntimeModule
    if (loaded.ColorDiff && loaded.ColorFile) {
      colorDiffRuntimeModule = loaded
    } else {
      colorDiffRuntimeModule = null
    }
  } catch {
    colorDiffRuntimeModule = null
  }

  return colorDiffRuntimeModule
}

/**
 * Returns a static reason why the color-diff module is unavailable, or null if available.
 * 'env' = disabled via CODEX_CODE_SYNTAX_HIGHLIGHT
 *
 * The TS port of color-diff works in all build modes, so the only way to
 * disable it is via the env var.
 */
export function getColorModuleUnavailableReason(): ColorDiffModuleUnavailableReason | null {
  if (isEnvDefinedFalsy(process.env.CODEX_CODE_SYNTAX_HIGHLIGHT)) {
    return 'env'
  }
  if (!getColorDiffRuntimeModule()) {
    return 'module'
  }
  return null
}

export function expectColorDiff(): ColorDiffType | null {
  return getColorDiffRuntimeModule()?.ColorDiff ?? null
}

export function expectColorFile(): ColorFileType | null {
  return getColorDiffRuntimeModule()?.ColorFile ?? null
}

export function getSyntaxTheme(themeName: string): SyntaxTheme | null {
  return getColorDiffRuntimeModule()?.getSyntaxTheme?.(themeName) ?? null
}

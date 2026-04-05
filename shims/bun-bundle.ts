function parseTruthy(value) {
  if (typeof value !== 'string') {
    return false
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function readFeatureSet() {
  const raw = process.env.CLAUDE_CODE_ENABLED_FEATURES ?? ''
  return new Set(
    raw
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
  )
}

const DEFAULT_ENABLED_FEATURES = new Set([])

export function feature(name) {
  const direct = process.env[`CLAUDE_CODE_FEATURE_${name}`]
  if (direct !== undefined) {
    return parseTruthy(direct)
  }
  return readFeatureSet().has(name) || DEFAULT_ENABLED_FEATURES.has(name)
}

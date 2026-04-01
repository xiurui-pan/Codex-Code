import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

type MinimalCodexProvider = {
  base_url?: string
  env_key?: string
}

export type LoadedCodexConfig = {
  configPath: string
  providerId: string
  provider: MinimalCodexProvider
  model?: string
  reasoningEffort?: string
}

function stripInlineComment(line: string): string {
  let inQuote = false
  let escaped = false
  let out = ''

  for (const char of line) {
    if (char === '\\' && !escaped) {
      escaped = true
      out += char
      continue
    }

    if (char === '"' && !escaped) {
      inQuote = !inQuote
    }

    if (char === '#' && !inQuote) {
      break
    }

    out += char
    escaped = false
  }

  return out.trim()
}

function parseValue(rawValue: string): string | boolean | number {
  const value = rawValue.trim()

  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1)
  }

  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  if (/^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10)
  }

  return value
}

function parseMinimalToml(source: string): {
  model_provider?: string
  model?: string
  model_reasoning_effort?: string
  model_providers: Record<string, MinimalCodexProvider>
} {
  const root: {
    model_provider?: string
    model?: string
    model_reasoning_effort?: string
    model_providers: Record<string, MinimalCodexProvider>
  } = {
    model_providers: {},
  }
  let currentSection: string | null = null

  for (const originalLine of source.split('\n')) {
    const line = stripInlineComment(originalLine)
    if (!line) {
      continue
    }

    const sectionMatch = line.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      currentSection = sectionMatch[1] ?? null
      continue
    }

    const keyValueMatch = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/)
    if (!keyValueMatch) {
      continue
    }

    const [, key, rawValue] = keyValueMatch
    const value = parseValue(rawValue ?? '')

    if (currentSection?.startsWith('model_providers.')) {
      const providerId = currentSection.slice('model_providers.'.length)
      root.model_providers[providerId] ??= {}
      root.model_providers[providerId][key as keyof MinimalCodexProvider] =
        String(value)
      continue
    }

    if (currentSection === null) {
      if (key === 'model_provider') {
        root.model_provider = String(value)
      } else if (key === 'model') {
        root.model = String(value)
      } else if (key === 'model_reasoning_effort') {
        root.model_reasoning_effort = String(value)
      }
    }
  }

  return root
}

export function getDefaultCodexConfigPath(): string {
  return join(homedir(), '.codex', 'config.toml')
}

export async function loadCodexConfig(
  configPath = getDefaultCodexConfigPath(),
): Promise<LoadedCodexConfig> {
  const source = await readFile(configPath, 'utf8')
  const parsed = parseMinimalToml(source)
  const providerId = parsed.model_provider

  if (!providerId) {
    throw new Error(`config missing model_provider: ${configPath}`)
  }

  const provider = parsed.model_providers[providerId]
  if (!provider) {
    throw new Error(
      `config missing provider section for ${providerId}: ${configPath}`,
    )
  }

  return {
    configPath,
    providerId,
    provider,
    model: parsed.model,
    reasoningEffort: parsed.model_reasoning_effort,
  }
}

export async function loadCodexConfigIfPresent(): Promise<LoadedCodexConfig | null> {
  try {
    return await loadCodexConfig()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ENOENT')) {
      return null
    }
    throw error
  }
}

export function applyCodexConfigToEnv(config: LoadedCodexConfig): void {
  process.env.CLAUDE_CODE_USE_CODEX_PROVIDER = '1'
  process.env.CLAUDE_CODE_CODEX_CONFIG_PATH = config.configPath
  process.env.CLAUDE_CODE_CODEX_MODEL_PROVIDER = config.providerId

  if (config.provider.base_url) {
    process.env.ANTHROPIC_BASE_URL = config.provider.base_url
  }

  if (config.model) {
    process.env.ANTHROPIC_MODEL = config.model
  }

  if (config.reasoningEffort) {
    process.env.CLAUDE_CODE_EFFORT_LEVEL = config.reasoningEffort
  }

  if (config.provider.env_key) {
    process.env.CLAUDE_CODE_CODEX_ENV_KEY = config.provider.env_key
    const apiKey = process.env[config.provider.env_key]
    if (apiKey) {
      process.env.ANTHROPIC_API_KEY = apiKey
    }
  }
}

export function getCodexConfiguredModel(): string | undefined {
  return process.env.ANTHROPIC_MODEL
}

export function getCodexConfiguredReasoningEffort(): string | undefined {
  return process.env.CLAUDE_CODE_EFFORT_LEVEL
}

export function hasCodexConfigInEnv(): boolean {
  return process.env.CLAUDE_CODE_USE_CODEX_PROVIDER === '1'
}

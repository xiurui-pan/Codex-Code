import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

type MinimalCodexProvider = {
  base_url?: string
  env_key?: string
}

type MinimalCodexWebSearchLocation = {
  country?: string
  region?: string
  city?: string
  timezone?: string
}

type MinimalCodexWebSearchConfig = {
  context_size?: string
  allowed_domains?: string[]
  location?: MinimalCodexWebSearchLocation
}

export type LoadedCodexConfig = {
  configPath: string
  providerId: string
  provider: MinimalCodexProvider
  baseUrl?: string
  model?: string
  reasoningEffort?: string
  responseStorage?: boolean
  webSearchMode?: string
  webSearch?: MinimalCodexWebSearchConfig
  apiKeyEnvName?: string
  apiKey?: string
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

function splitDelimitedValues(source: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuote = false
  let braceDepth = 0
  let bracketDepth = 0
  let escaped = false

  for (const char of source) {
    if (char === '\\' && !escaped) {
      escaped = true
      current += char
      continue
    }

    if (char === '"' && !escaped) {
      inQuote = !inQuote
      current += char
      continue
    }

    if (!inQuote) {
      if (char === '{') braceDepth += 1
      if (char === '}') braceDepth = Math.max(0, braceDepth - 1)
      if (char === '[') bracketDepth += 1
      if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1)

      if (char === ',' && braceDepth === 0 && bracketDepth === 0) {
        const value = current.trim()
        if (value) {
          values.push(value)
        }
        current = ''
        continue
      }
    }

    current += char
    escaped = false
  }

  const finalValue = current.trim()
  if (finalValue) {
    values.push(finalValue)
  }

  return values
}

function parseInlineObject(
  rawValue: string,
): Record<string, string | boolean | number | string[]> {
  const inner = rawValue.slice(1, -1).trim()
  const parsed: Record<string, string | boolean | number | string[]> = {}

  for (const entry of splitDelimitedValues(inner)) {
    const [key, ...rest] = entry.split('=')
    if (!key || rest.length === 0) {
      continue
    }
    parsed[key.trim()] = parseValue(rest.join('=').trim())
  }

  return parsed
}

function parseValue(
  rawValue: string,
): string | boolean | number | string[] | Record<string, string | boolean | number | string[]> {
  const value = rawValue.trim()

  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1)
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    return splitDelimitedValues(value.slice(1, -1))
      .map(entry => parseValue(entry))
      .filter((entry): entry is string => typeof entry === 'string')
  }

  if (value.startsWith('{') && value.endsWith('}')) {
    return parseInlineObject(value)
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

function parseBooleanEnvValue(
  value: string | undefined,
): boolean | undefined {
  if (value === '1' || value === 'true') {
    return true
  }

  if (value === '0' || value === 'false') {
    return false
  }

  return undefined
}

function parseMinimalToml(source: string): {
  model_provider?: string
  model?: string
  model_reasoning_effort?: string
  response_storage?: boolean
  disable_response_storage?: boolean
  web_search?: string
  tools: {
    web_search?: MinimalCodexWebSearchConfig
  }
  model_providers: Record<string, MinimalCodexProvider>
} {
  const root: {
    model_provider?: string
    model?: string
    model_reasoning_effort?: string
    response_storage?: boolean
    disable_response_storage?: boolean
    web_search?: string
    tools: {
      web_search?: MinimalCodexWebSearchConfig
    }
    model_providers: Record<string, MinimalCodexProvider>
  } = {
    tools: {},
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

    if (currentSection === 'tools.web_search') {
      root.tools.web_search ??= {}

      if (key === 'context_size' && typeof value === 'string') {
        root.tools.web_search.context_size = value
      } else if (
        key === 'allowed_domains' &&
        Array.isArray(value)
      ) {
        root.tools.web_search.allowed_domains = value
      } else if (
        key === 'location' &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        root.tools.web_search.location = {
          country:
            typeof value.country === 'string' ? value.country : undefined,
          region: typeof value.region === 'string' ? value.region : undefined,
          city: typeof value.city === 'string' ? value.city : undefined,
          timezone:
            typeof value.timezone === 'string' ? value.timezone : undefined,
        }
      }
      continue
    }

    if (currentSection === null) {
      if (key === 'model_provider') {
        root.model_provider = String(value)
      } else if (key === 'model') {
        root.model = String(value)
      } else if (key === 'model_reasoning_effort') {
        root.model_reasoning_effort = String(value)
      } else if (key === 'web_search' && typeof value === 'string') {
        root.web_search = value
      } else if (key === 'response_storage' && typeof value === 'boolean') {
        root.response_storage = value
      } else if (
        key === 'disable_response_storage' &&
        typeof value === 'boolean'
      ) {
        root.disable_response_storage = value
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

  const responseStorage =
    typeof parsed.response_storage === 'boolean'
      ? parsed.response_storage
      : parsed.disable_response_storage === true
        ? false
        : undefined

  return {
    configPath,
    providerId,
    provider,
    baseUrl: provider.base_url,
    model: parsed.model,
    reasoningEffort: parsed.model_reasoning_effort,
    responseStorage,
    webSearchMode: parsed.web_search,
    webSearch: parsed.tools.web_search,
    apiKeyEnvName: provider.env_key,
    apiKey: provider.env_key ? process.env[provider.env_key] : undefined,
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
  process.env.CODEX_CODE_USE_CODEX_PROVIDER = '1'
  process.env.CODEX_CODE_CONFIG_PATH = config.configPath
  process.env.CODEX_CODE_MODEL_PROVIDER = config.providerId

  if (config.provider.base_url) {
    process.env.CODEX_CODE_BASE_URL = config.provider.base_url
  }

  if (config.model) {
    process.env.CODEX_CODE_MODEL = config.model
  }

  if (config.reasoningEffort) {
    process.env.CODEX_CODE_EFFORT_LEVEL = config.reasoningEffort
  }

  if (typeof config.responseStorage === 'boolean') {
    process.env.CODEX_CODE_RESPONSE_STORAGE = config.responseStorage
      ? '1'
      : '0'
  }

  if (config.webSearchMode) {
    process.env.CODEX_CODE_WEB_SEARCH_MODE = config.webSearchMode
  }

  if (config.webSearch?.context_size) {
    process.env.CODEX_CODE_WEB_SEARCH_CONTEXT_SIZE =
      config.webSearch.context_size
  }

  if (config.webSearch?.allowed_domains) {
    process.env.CODEX_CODE_WEB_SEARCH_ALLOWED_DOMAINS = JSON.stringify(
      config.webSearch.allowed_domains,
    )
  }

  if (config.webSearch?.location) {
    process.env.CODEX_CODE_WEB_SEARCH_LOCATION = JSON.stringify(
      config.webSearch.location,
    )
  }

  if (config.provider.env_key) {
    process.env.CODEX_CODE_ENV_KEY = config.provider.env_key
    const apiKey = config.apiKey ?? process.env[config.provider.env_key]
    if (apiKey) {
      process.env.CODEX_CODE_API_KEY = apiKey
    }
  }
}

export function getCodexConfiguredBaseUrl(): string | undefined {
  return process.env.CODEX_CODE_BASE_URL ?? process.env.ANTHROPIC_BASE_URL
}

export function getCodexConfiguredModel(): string | undefined {
  return process.env.CODEX_CODE_MODEL ?? process.env.ANTHROPIC_MODEL
}

export function getCodexConfiguredReasoningEffort(): string | undefined {
  return process.env.CODEX_CODE_EFFORT_LEVEL
}

export function getCodexConfiguredResponseStorage(): boolean | undefined {
  return parseBooleanEnvValue(process.env.CODEX_CODE_RESPONSE_STORAGE)
}

export function getCodexConfiguredWebSearchMode():
  | 'live'
  | 'cached'
  | 'disabled'
  | undefined {
  const mode = process.env.CODEX_CODE_WEB_SEARCH_MODE
  return mode === 'live' || mode === 'cached' || mode === 'disabled'
    ? mode
    : undefined
}

export function getCodexConfiguredWebSearchContextSize(): string | undefined {
  return process.env.CODEX_CODE_WEB_SEARCH_CONTEXT_SIZE
}

export function getCodexConfiguredWebSearchAllowedDomains(): string[] | undefined {
  const raw = process.env.CODEX_CODE_WEB_SEARCH_ALLOWED_DOMAINS
  if (!raw) {
    return undefined
  }

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is string =>
            typeof entry === 'string' && entry.trim().length > 0,
        )
      : undefined
  } catch {
    return undefined
  }
}

export function getCodexConfiguredWebSearchLocation():
  | MinimalCodexWebSearchLocation
  | undefined {
  const raw = process.env.CODEX_CODE_WEB_SEARCH_LOCATION
  if (!raw) {
    return undefined
  }

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined
    }

    return {
      country:
        typeof parsed.country === 'string' ? parsed.country : undefined,
      region: typeof parsed.region === 'string' ? parsed.region : undefined,
      city: typeof parsed.city === 'string' ? parsed.city : undefined,
      timezone:
        typeof parsed.timezone === 'string' ? parsed.timezone : undefined,
    }
  } catch {
    return undefined
  }
}

export function getCodexConfiguredAuthEnvKey(): string | undefined {
  return process.env.CODEX_CODE_ENV_KEY
}

export function getCodexConfiguredApiKey(): string | undefined {
  return process.env.CODEX_CODE_API_KEY ?? process.env.ANTHROPIC_API_KEY
}

export function shouldSendCodexRequestIdentity(): boolean {
  return parseBooleanEnvValue(
    process.env.CODEX_CODE_SEND_REQUEST_IDENTITY,
  ) === true
}

export function hasCodexConfigInEnv(): boolean {
  return process.env.CODEX_CODE_USE_CODEX_PROVIDER === '1'
}

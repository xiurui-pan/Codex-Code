import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

function stripInlineComment(line) {
  let inQuote = false;
  let escaped = false;
  let out = '';

  for (const char of line) {
    if (char === '\\' && !escaped) {
      escaped = true;
      out += char;
      continue;
    }

    if (char === '"' && !escaped) {
      inQuote = !inQuote;
    }

    if (char === '#' && !inQuote) {
      break;
    }

    out += char;
    escaped = false;
  }

  return out.trim();
}

function parseValue(rawValue) {
  const value = rawValue.trim();

  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  if (/^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  return value;
}

function parseMinimalToml(source) {
  const root = {};
  const providers = {};
  let currentSection = null;

  for (const originalLine of source.split('\n')) {
    const line = stripInlineComment(originalLine);
    if (!line) {
      continue;
    }

    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    const keyValueMatch = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!keyValueMatch) {
      continue;
    }

    const [, key, rawValue] = keyValueMatch;
    const value = parseValue(rawValue);

    if (currentSection?.startsWith('model_providers.')) {
      const providerId = currentSection.slice('model_providers.'.length);
      providers[providerId] ??= {};
      providers[providerId][key] = value;
      continue;
    }

    if (!currentSection) {
      root[key] = value;
    }
  }

  root.model_providers = providers;
  return root;
}

export function defaultCodexConfigPath() {
  return path.join(homedir(), '.codex', 'config.toml');
}

export async function loadCodexConfig(configPath = defaultCodexConfigPath()) {
  const source = await readFile(configPath, 'utf8');
  const parsed = parseMinimalToml(source);
  const providerId = parsed.model_provider;

  if (!providerId) {
    throw new Error(`config missing model_provider: ${configPath}`);
  }

  const provider = parsed.model_providers?.[providerId];
  if (!provider) {
    throw new Error(`config missing provider section for ${providerId}: ${configPath}`);
  }

  return {
    configPath,
    providerId,
    provider,
    model: parsed.model,
    reasoningEffort: parsed.model_reasoning_effort,
    disableResponseStorage: Boolean(parsed.disable_response_storage),
  };
}

export function resolveSessionSettings(config, overrides = {}) {
  const model = overrides.model ?? config.model ?? 'gpt-5.4';
  const reasoningEffort = overrides.reasoningEffort ?? 'medium';

  return {
    model,
    reasoningEffort,
  };
}


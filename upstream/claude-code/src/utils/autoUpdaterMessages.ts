import type { InstallStatus } from './autoUpdater.js'

export function resolveAutoUpdatePackageName(
  packageUrl: string | undefined,
  userType: string | undefined,
): string | null {
  void userType
  if (packageUrl && packageUrl.trim().length > 0) {
    const normalized = packageUrl.trim()
    if (
      normalized === '@anthropic-ai/claude-code' ||
      normalized === '@anthropic-ai/claude-cli' ||
      normalized === 'claude-code'
    ) {
      return null
    }
    return normalized
  }
  return null
}

export function getAutoUpdateRecoveryCommand({
  hasLocalInstall,
  packageUrl,
  userType,
}: {
  hasLocalInstall: boolean
  packageUrl: string | undefined
  userType: string | undefined
}): string {
  const packageName = resolveAutoUpdatePackageName(packageUrl, userType)
  if (!packageName) {
    return hasLocalInstall
      ? 'reinstall Codex Code in ~/.claude/local'
      : 'reinstall Codex Code'
  }
  return hasLocalInstall
    ? `cd ~/.claude/local && npm update ${packageName}`
    : `npm install -g ${packageName}`
}

export function getAutoUpdateFailureHint(
  status: InstallStatus | undefined,
): string | null {
  if (status === 'install_failed') {
    return 'If your network is restricted, verify npm registry access (or configure an npm mirror) and retry.'
  }
  return null
}

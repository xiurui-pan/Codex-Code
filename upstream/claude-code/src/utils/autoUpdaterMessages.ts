import type { InstallStatus } from './autoUpdater.js'

export function resolveAutoUpdatePackageName(
  packageUrl: string | undefined,
  userType: string | undefined,
): string {
  void userType
  if (packageUrl && packageUrl.trim().length > 0) {
    // Keep official legacy package names out of user-facing recovery commands.
    if (packageUrl.trim() === '@anthropic-ai/claude-code') {
      return 'claude-code'
    }
    return packageUrl
  }
  return 'claude-code'
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

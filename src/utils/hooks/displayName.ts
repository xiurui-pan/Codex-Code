export function formatHookNameForDisplay(hookName: string): string {
  const separatorIndex = hookName.indexOf(':')
  if (separatorIndex <= 0 || separatorIndex === hookName.length - 1) {
    return hookName
  }

  return `${hookName.slice(0, separatorIndex)} (${hookName.slice(separatorIndex + 1)})`
}

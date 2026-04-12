declare module '@ant/computer-use-mcp/types' {
  export type CoordinateMode = 'pixels' | 'normalized'
  export type CuSubGates = {
    pixelValidation?: boolean
    clipboardPasteMultiline?: boolean
    mouseAnimation?: boolean
    hideBeforeAction?: boolean
    autoTargetDisplay?: boolean
    clipboardGuard?: boolean
    [key: string]: boolean | undefined
  }
  export type CuGrantFlags = {
    clipboardRead: boolean
    clipboardWrite: boolean
    systemKeyCombos: boolean
    [key: string]: boolean
  }
  export type CuPermissionRequest = any
  export type CuPermissionResponse = any
  export type ScreenshotDims = any
  export type Logger = any
  export type ComputerUseHostAdapter = any
  export type ComputerUseSessionContext = any
  export const DEFAULT_GRANT_FLAGS: CuGrantFlags
}

declare module '@ant/computer-use-mcp/sentinelApps' {
  export function getSentinelCategory(bundleId: string):
    | 'shell'
    | 'filesystem'
    | 'system_settings'
    | null
}

declare module '@ant/computer-use-mcp' {
  export type DisplayGeometry = any
  export type FrontmostApp = any
  export type InstalledApp = any
  export type RunningApp = any
  export type ScreenshotResult = any
  export type ResolvePrepareCaptureResult = any
  export type ComputerExecutor = any
  export type ComputerUseTool = any
  export type CuCallToolResult = any
  export type ComputerUseSessionContext = any
  export type CuPermissionRequest = any
  export type CuPermissionResponse = any
  export type ScreenshotDims = any
  export const DEFAULT_GRANT_FLAGS: import('@ant/computer-use-mcp/types').CuGrantFlags
  export function bindSessionContext(...args: any[]): any
  export function buildComputerUseTools(...args: any[]): any[]
  export function createComputerUseMcpServer(...args: any[]): any
  export const API_RESIZE_PARAMS: any
  export function targetImageSize(...args: any[]): [number, number]
}

declare module '@ant/computer-use-swift' {
  export type ComputerUseAPI = any
}

declare module '@ant/computer-use-input' {
  export type ComputerUseInputAPI = any
  export type ComputerUseInput = any
}

// This file represents useful wrappers over node:child_process
// These wrappers ease error handling and cross-platform compatbility
// By using execa, Windows automatically gets shell escaping + BAT / CMD handling

import { spawn } from 'node:child_process'
import { getCwd } from '../utils/cwd.js'
import { logError } from './log.js'

export { execSyncWithDefaults_DEPRECATED } from './execFileNoThrowPortable.js'

const MS_IN_SECOND = 1000
const SECONDS_IN_MINUTE = 60

type ExecFileOptions = {
  abortSignal?: AbortSignal
  timeout?: number
  preserveOutputOnError?: boolean
  // Setting useCwd=false avoids circular dependencies during initialization
  // getCwd() -> PersistentShell -> logEvent() -> execFileNoThrow
  useCwd?: boolean
  env?: NodeJS.ProcessEnv
  stdin?: 'ignore' | 'inherit' | 'pipe'
  input?: string
}

export function execFileNoThrow(
  file: string,
  args: string[],
  options: ExecFileOptions = {
    timeout: 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
    preserveOutputOnError: true,
    useCwd: true,
  },
): Promise<{ stdout: string; stderr: string; code: number; error?: string }> {
  return execFileNoThrowWithCwd(file, args, {
    abortSignal: options.abortSignal,
    timeout: options.timeout,
    preserveOutputOnError: options.preserveOutputOnError,
    cwd: options.useCwd ? getCwd() : undefined,
    env: options.env,
    stdin: options.stdin,
    input: options.input,
  })
}

type ExecFileWithCwdOptions = {
  abortSignal?: AbortSignal
  timeout?: number
  preserveOutputOnError?: boolean
  maxBuffer?: number
  cwd?: string
  env?: NodeJS.ProcessEnv
  shell?: boolean | string | undefined
  stdin?: 'ignore' | 'inherit' | 'pipe'
  input?: string
}

function getErrorMessage(signal: NodeJS.Signals | null, errorCode: number): string {
  if (typeof signal === 'string') {
    return signal
  }
  return String(errorCode)
}

/**
 * execFile, but always resolves (never throws)
 */
export function execFileNoThrowWithCwd(
  file: string,
  args: string[],
  {
    abortSignal,
    timeout: finalTimeout = 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
    preserveOutputOnError: finalPreserveOutput = true,
    cwd: finalCwd,
    env: finalEnv,
    maxBuffer,
    shell,
    stdin: finalStdin,
    input: finalInput,
  }: ExecFileWithCwdOptions = {
    timeout: 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
    preserveOutputOnError: true,
    maxBuffer: 1_000_000,
  },
): Promise<{ stdout: string; stderr: string; code: number; error?: string }> {
  return new Promise(resolve => {
    const child = spawn(file, args, {
      signal: abortSignal,
      timeout: finalTimeout,
      cwd: finalCwd,
      env: finalEnv,
      shell,
      stdio: [finalStdin ?? 'pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (result: { stdout: string; stderr: string; code: number; error?: string }) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')

    child.stdout?.on('data', chunk => {
      stdout += chunk
      if (maxBuffer && stdout.length + stderr.length > maxBuffer) {
        child.kill()
      }
    })
    child.stderr?.on('data', chunk => {
      stderr += chunk
      if (maxBuffer && stdout.length + stderr.length > maxBuffer) {
        child.kill()
      }
    })

    child.on('error', error => {
      logError(error)
      finish({ stdout: '', stderr: '', code: 1 })
    })

    child.on('close', (code, signal) => {
      const exitCode = code ?? 1
      if (exitCode !== 0 || signal) {
        if (finalPreserveOutput) {
          finish({
            stdout,
            stderr,
            code: exitCode,
            error: getErrorMessage(signal, exitCode),
          })
          return
        }
        finish({ stdout: '', stderr: '', code: exitCode })
        return
      }
      finish({ stdout, stderr, code: 0 })
    })

    if (finalInput !== undefined) {
      child.stdin?.end(finalInput)
    } else if (finalStdin !== 'inherit') {
      child.stdin?.end()
    }
  })
}

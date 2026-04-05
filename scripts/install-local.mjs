#!/usr/bin/env node

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const distCli = path.join(root, 'dist', 'cli.js')
const defaultBinDir = path.join(os.homedir(), '.local', 'bin')
const commandName = process.platform === 'win32' ? 'codex-code.cmd' : 'codex-code'
const nodeExecutable = process.execPath

function parseArgs(argv) {
  const options = {
    binDir: defaultBinDir,
    force: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--force') {
      options.force = true
      continue
    }

    if (arg === '--bin-dir') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('Missing value for --bin-dir')
      }
      options.binDir = path.resolve(value)
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

function renderUnixLauncher() {
  return `#!/bin/sh
set -eu
export CODEX_CODE_USE_CODEX_PROVIDER="\${CODEX_CODE_USE_CODEX_PROVIDER:-1}"
export DISABLE_AUTOUPDATER="\${DISABLE_AUTOUPDATER:-1}"
exec "${nodeExecutable}" "${distCli}" "$@"
`
}

function renderWindowsLauncher() {
  return `@echo off
set "CODEX_CODE_USE_CODEX_PROVIDER=%CODEX_CODE_USE_CODEX_PROVIDER%"
if not defined CODEX_CODE_USE_CODEX_PROVIDER set "CODEX_CODE_USE_CODEX_PROVIDER=1"
set "DISABLE_AUTOUPDATER=%DISABLE_AUTOUPDATER%"
if not defined DISABLE_AUTOUPDATER set "DISABLE_AUTOUPDATER=1"
"${nodeExecutable}" "${distCli}" %*
`
}

function isDirOnPath(targetDir) {
  const currentPath = process.env.PATH ?? ''
  const delimiter = path.delimiter
  return currentPath
    .split(delimiter)
    .map(entry => entry.trim())
    .filter(Boolean)
    .some(entry => path.resolve(entry) === path.resolve(targetDir))
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (!(await exists(distCli))) {
    throw new Error('Missing dist/cli.js. Run `pnpm build` first.')
  }

  await fs.mkdir(options.binDir, { recursive: true })

  const launcherPath = path.join(options.binDir, commandName)
  if ((await exists(launcherPath)) && !options.force) {
    const current = await fs.readFile(launcherPath, 'utf8').catch(() => '')
    const next = process.platform === 'win32' ? renderWindowsLauncher() : renderUnixLauncher()
    if (current === next) {
      console.log(`Launcher already installed at ${launcherPath}`)
      if (!isDirOnPath(options.binDir)) {
        console.log(`Add ${options.binDir} to PATH before running codex-code`)
      }
      return
    }
    throw new Error(
      `Launcher already exists at ${launcherPath}. Re-run with --force to replace it.`,
    )
  }

  const launcher =
    process.platform === 'win32' ? renderWindowsLauncher() : renderUnixLauncher()
  await fs.writeFile(launcherPath, launcher, 'utf8')

  if (process.platform !== 'win32') {
    await fs.chmod(launcherPath, 0o755)
  }

  console.log(`Installed codex-code launcher at ${launcherPath}`)
  console.log('The launcher enables the Codex provider and disables auto-update by default.')

  if (!isDirOnPath(options.binDir)) {
    console.log(`Add ${options.binDir} to PATH before running codex-code`)
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

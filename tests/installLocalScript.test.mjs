import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { closeSync, openSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

function makeEnv(overrides = {}) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key]
    } else {
      env[key] = value
    }
  }
  return env
}

async function run(command, args, envOverrides = {}) {
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-install-run-'))
  const stdoutPath = join(tempDir, 'stdout.txt')
  const stderrPath = join(tempDir, 'stderr.txt')
  const stdoutFd = openSync(stdoutPath, 'w')
  const stderrFd = openSync(stderrPath, 'w')
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: makeEnv(envOverrides),
    stdio: ['ignore', stdoutFd, stderrFd],
  })
  try {
    const [code] = await once(child, 'close')
    const [stdout, stderr] = await Promise.all([
      readFile(stdoutPath, 'utf8'),
      readFile(stderrPath, 'utf8'),
    ])
    assert.equal(code, 0, stderr || `child exited with ${code}`)
    return { stdout, stderr }
  } finally {
    closeSync(stdoutFd)
    closeSync(stderrFd)
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function runAllowFailure(command, args, envOverrides = {}) {
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-install-run-'))
  const stdoutPath = join(tempDir, 'stdout.txt')
  const stderrPath = join(tempDir, 'stderr.txt')
  const stdoutFd = openSync(stdoutPath, 'w')
  const stderrFd = openSync(stderrPath, 'w')
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: makeEnv(envOverrides),
    stdio: ['ignore', stdoutFd, stderrFd],
  })
  try {
    const [code] = await once(child, 'close')
    const [stdout, stderr] = await Promise.all([
      readFile(stdoutPath, 'utf8'),
      readFile(stderrPath, 'utf8'),
    ])
    return { code, stdout, stderr }
  } finally {
    closeSync(stdoutFd)
    closeSync(stderrFd)
    await rm(tempDir, { recursive: true, force: true })
  }
}

test('install-local script creates codex-code and ccx launchers that start the CLI', async () => {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-code-install-home-'))
  const tempBin = join(tempHome, '.local', 'bin')

  try {
    const install = await run(process.execPath, [
      'scripts/install-local.mjs',
      '--bin-dir',
      tempBin,
    ])

    assert.match(install.stdout, /Installed launchers at /)
    assert.match(
      install.stdout,
      /The launchers enable the Codex provider and disable auto-update by default\./,
    )

    const launcherPath = join(tempBin, 'codex-code')
    const launcher = await readFile(launcherPath, 'utf8')
    assert.match(launcher, /CODEX_CODE_USE_CODEX_PROVIDER/)
    assert.match(launcher, /DISABLE_AUTOUPDATER/)
    const aliasPath = join(tempBin, 'ccx')
    const aliasLauncher = await readFile(aliasPath, 'utf8')
    assert.equal(aliasLauncher, launcher)

    const version = await run(launcherPath, ['--version'], {
      HOME: tempHome,
    })
    assert.match(version.stdout, /Codex Code/)

    const help = await run(launcherPath, ['--help'], {
      HOME: tempHome,
    })
    assert.match(help.stdout, /Usage: codex-code/)

    const aliasVersion = await run(aliasPath, ['--version'], {
      HOME: tempHome,
    })
    assert.match(aliasVersion.stdout, /Codex Code/)
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
})

test('install-local script refuses to overwrite a different launcher without --force', async () => {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-code-install-home-'))
  const tempBin = join(tempHome, '.local', 'bin')
  const launcherPath = join(tempBin, 'codex-code')

  try {
    await run(process.execPath, ['-e', `require("fs").mkdirSync(${JSON.stringify(tempBin)}, { recursive: true })`])
    const customLauncher = '#!/bin/sh\necho keep-me\n'
    await run(process.execPath, [
      '-e',
      `require("fs").writeFileSync(${JSON.stringify(launcherPath)}, ${JSON.stringify(customLauncher)})`,
    ])

    const result = await runAllowFailure(process.execPath, [
      'scripts/install-local.mjs',
      '--bin-dir',
      tempBin,
    ])

    assert.equal(result.code, 1)
    assert.match(result.stderr, /Re-run with --force to replace it\./)
    assert.equal(await readFile(launcherPath, 'utf8'), customLauncher)
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
})

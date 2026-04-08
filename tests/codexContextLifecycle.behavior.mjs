import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { closeSync, openSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectRoot } from './helpers/projectRoot.mjs'

function makeEnv(overrides = {}) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  delete env.NODE_ENV
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key]
    } else {
      env[key] = value
    }
  }
  return env
}

async function runInlineModule(source, envOverrides = {}) {
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-context-inline-'))
  const stdoutPath = join(tempDir, 'stdout.txt')
  const stderrPath = join(tempDir, 'stderr.txt')
  const stdoutFd = openSync(stdoutPath, 'w')
  const stderrFd = openSync(stderrPath, 'w')
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', '--loader', './dist/loader.mjs', '--input-type=module', '-e', source],
    {
      cwd: projectRoot,
      env: makeEnv(envOverrides),
      stdio: ['ignore', stdoutFd, stderrFd],
    },
  )

  try {
    const [code] = await once(child, 'close')
    const [stdout, stderr] = await Promise.all([
      readFile(stdoutPath, 'utf8'),
      readFile(stderrPath, 'utf8'),
    ])
    assert.equal(code, 0, stderr || `child exited with ${code}`)
    return stdout.trim()
  } finally {
    closeSync(stdoutFd)
    closeSync(stderrFd)
    await rm(tempDir, { recursive: true, force: true })
  }
}

test('codex mode enables git snapshot by default and still honors explicit opt-out', async () => {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-context-home-'))
  const tempProject = await mkdtemp(join(tmpdir(), 'codex-context-project-'))
  const claudeDir = join(tempHome, '.claude')

  try {
    await mkdir(claudeDir, { recursive: true })
    await writeFile(join(tempProject, 'README.md'), '# temp\n', 'utf8')
    execFileSync('git', ['init', '-b', 'main'], { cwd: tempProject })
    execFileSync('git', ['config', 'user.email', 'codex@example.com'], {
      cwd: tempProject,
    })
    execFileSync('git', ['config', 'user.name', 'Codex Test'], {
      cwd: tempProject,
    })
    execFileSync('git', ['add', 'README.md'], { cwd: tempProject })
    execFileSync('git', ['commit', '-m', 'init'], { cwd: tempProject })

    const probe = [
      `process.chdir(${JSON.stringify(tempProject)})`,
      "const { getSystemContext } = await import('./src/context.ts')",
      'const ctx = await getSystemContext()',
      'process.stdout.write(JSON.stringify(ctx))',
      'process.exit(0)',
    ].join('\n')

    const defaultOutput = JSON.parse(
      await runInlineModule(probe, {
        HOME: tempHome,
        CLAUDE_CONFIG_DIR: claudeDir,
        CODEX_CODE_USE_CODEX_PROVIDER: '1',
        NODE_ENV: 'production',
      }),
    )
    assert.match(defaultOutput.gitStatus, /Current branch: main/)
    assert.match(defaultOutput.gitStatus, /Recent commits:/)

    await writeFile(
      join(claudeDir, 'settings.json'),
      JSON.stringify({ includeGitInstructions: false }),
      'utf8',
    )

    const optOutOutput = JSON.parse(
      await runInlineModule(probe, {
        HOME: tempHome,
        CLAUDE_CONFIG_DIR: claudeDir,
        CODEX_CODE_USE_CODEX_PROVIDER: '1',
        NODE_ENV: 'production',
      }),
    )
    assert.equal(optOutOutput.gitStatus, undefined)
  } finally {
    await rm(tempHome, { recursive: true, force: true })
    await rm(tempProject, { recursive: true, force: true })
  }
})

test('git snapshot is a session-start snapshot and does not auto-refresh mid-session', async () => {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-context-home-'))
  const tempProject = await mkdtemp(join(tmpdir(), 'codex-context-project-'))
  const claudeDir = join(tempHome, '.claude')

  try {
    await mkdir(claudeDir, { recursive: true })
    await writeFile(join(tempProject, 'README.md'), '# temp\n', 'utf8')
    await writeFile(
      join(claudeDir, 'settings.json'),
      JSON.stringify({ includeGitInstructions: true }),
      'utf8',
    )
    execFileSync('git', ['init', '-b', 'main'], { cwd: tempProject })
    execFileSync('git', ['config', 'user.email', 'codex@example.com'], {
      cwd: tempProject,
    })
    execFileSync('git', ['config', 'user.name', 'Codex Test'], {
      cwd: tempProject,
    })
    execFileSync('git', ['add', 'README.md'], { cwd: tempProject })
    execFileSync('git', ['commit', '-m', 'init'], { cwd: tempProject })

    const probe = [
      `process.chdir(${JSON.stringify(tempProject)})`,
      "const { writeFile } = await import('node:fs/promises')",
      "const { getSystemContext, getGitStatus } = await import('./src/context.ts')",
      'const first = await getSystemContext()',
      `await writeFile(${JSON.stringify(join(tempProject, 'README.md'))}, '# changed\\n', 'utf8')`,
      'const second = await getSystemContext()',
      'getSystemContext.cache.clear?.()',
      'getGitStatus.cache.clear?.()',
      'const third = await getSystemContext()',
      'process.stdout.write(JSON.stringify({ first: first.gitStatus, second: second.gitStatus, third: third.gitStatus }))',
      'process.exit(0)',
    ].join('\n')

    const output = JSON.parse(
      await runInlineModule(probe, {
        HOME: tempHome,
        CLAUDE_CONFIG_DIR: claudeDir,
        CODEX_CODE_USE_CODEX_PROVIDER: '1',
        NODE_ENV: 'production',
      }),
    )

    assert.match(output.first, /\(clean\)/)
    assert.equal(output.second, output.first)
    assert.match(output.third, /README\.md/)
  } finally {
    await rm(tempHome, { recursive: true, force: true })
    await rm(tempProject, { recursive: true, force: true })
  }
})

test('codex mode still includes MCP server instructions in the live system prompt', async () => {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-context-home-'))
  const tempProject = await mkdtemp(join(tmpdir(), 'codex-context-project-'))
  const claudeDir = join(tempHome, '.claude')

  try {
    await mkdir(claudeDir, { recursive: true })
    const probe = [
      `process.chdir(${JSON.stringify(tempProject)})`,
      "globalThis.eval(\"var MACRO = { ISSUES_EXPLAINER: 'use /issue or /share for Codex Code feedback' }\")",
      "const { getSystemPrompt } = await import('./src/constants/prompts.ts')",
      `const prompt = await getSystemPrompt([], 'gpt-5.4', undefined, [{ type: 'connected', name: 'demo-mcp', instructions: 'Use DEMO_MCP_CONTEXT when available.' }])`,
      "process.stdout.write(prompt.join('\\n---\\n'))",
      'process.exit(0)',
    ].join('\n')

    const output = await runInlineModule(probe, {
      HOME: tempHome,
      CLAUDE_CONFIG_DIR: claudeDir,
      CODEX_CODE_USE_CODEX_PROVIDER: '1',
      NODE_ENV: 'production',
    })

    assert.match(output, /# MCP Server Instructions/)
    assert.match(output, /demo-mcp/)
    assert.match(output, /Use DEMO_MCP_CONTEXT when available\./)
  } finally {
    await rm(tempHome, { recursive: true, force: true })
    await rm(tempProject, { recursive: true, force: true })
  }
})

test('compact cleanup refreshes cached CLAUDE.md context for later turns', async () => {
  const tempHome = await mkdtemp(join(tmpdir(), 'codex-context-home-'))
  const tempProject = await mkdtemp(join(tmpdir(), 'codex-context-project-'))
  const claudeDir = join(tempHome, '.claude')
  const claudeMdPath = join(tempProject, 'CLAUDE.md')

  try {
    await mkdir(claudeDir, { recursive: true })
    await writeFile(claudeMdPath, 'Rule marker: BEFORE_COMPACT.\n', 'utf8')

    const probe = [
      `process.chdir(${JSON.stringify(tempProject)})`,
      "const { writeFile } = await import('node:fs/promises')",
      "const { enableConfigs } = await import('./src/utils/config.ts')",
      "const { getUserContext } = await import('./src/context.ts')",
      "const { runPostCompactCleanup } = await import('./src/services/compact/postCompactCleanup.ts')",
      'enableConfigs()',
      'const first = await getUserContext()',
      `await writeFile(${JSON.stringify(claudeMdPath)}, 'Rule marker: AFTER_COMPACT.\\n', 'utf8')`,
      'const second = await getUserContext()',
      'runPostCompactCleanup()',
      'const third = await getUserContext()',
      'process.stdout.write(JSON.stringify({ first: first.claudeMd, second: second.claudeMd, third: third.claudeMd }))',
      'process.exit(0)',
    ].join('\n')

    const output = JSON.parse(
      await runInlineModule(probe, {
        HOME: tempHome,
        CLAUDE_CONFIG_DIR: claudeDir,
        CODEX_CODE_USE_CODEX_PROVIDER: '1',
        NODE_ENV: 'production',
      }),
    )

    assert.match(output.first, /BEFORE_COMPACT/)
    assert.match(output.second, /BEFORE_COMPACT/)
    assert.match(output.third, /AFTER_COMPACT/)
  } finally {
    await rm(tempHome, { recursive: true, force: true })
    await rm(tempProject, { recursive: true, force: true })
  }
})

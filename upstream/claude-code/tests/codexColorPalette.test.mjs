import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(TEST_DIR, '..')

function runModuleJson({ env = {}, code }) {
  const result = spawnSync('pnpm', ['exec', 'tsx', '--eval', code], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    throw new Error(
      `module eval failed (status=${result.status}): ${result.stderr || result.stdout}`,
    )
  }

  return JSON.parse(result.stdout.trim())
}

test('theme runtime mapping switches to codex accent/status palette in codex mode', () => {
  const codexOn = runModuleJson({
    env: { CLAUDE_CODE_USE_CODEX_PROVIDER: '1' },
    code: `
      import { getTheme } from './src/utils/theme.ts'
      const theme = getTheme('dark')
      const ansiTheme = getTheme('dark-ansi')
      console.log(JSON.stringify({
        claude: theme.claude,
        success: theme.success,
        warning: theme.warning,
        briefLabelYou: theme.briefLabelYou,
        rateLimitFill: theme.rate_limit_fill,
        ansiClaude: ansiTheme.claude,
        ansiWarning: ansiTheme.warning,
      }))
    `,
  })

  const codexOff = runModuleJson({
    env: { CLAUDE_CODE_USE_CODEX_PROVIDER: '0' },
    code: `
      import { getTheme } from './src/utils/theme.ts'
      const theme = getTheme('dark')
      console.log(JSON.stringify({
        claude: theme.claude,
        success: theme.success,
      }))
    `,
  })

  assert.equal(codexOn.claude, 'rgb(0,179,219)')
  assert.equal(codexOn.success, 'rgb(80,200,120)')
  assert.equal(codexOn.warning, 'rgb(230,180,0)')
  assert.equal(codexOn.briefLabelYou, 'rgb(88,166,255)')
  assert.equal(codexOn.rateLimitFill, 'rgb(0,179,219)')
  assert.equal(codexOn.ansiClaude, 'ansi:cyan')
  assert.equal(codexOn.ansiWarning, 'ansi:yellow')
  assert.notEqual(codexOff.claude, codexOn.claude)
  assert.notEqual(codexOff.success, codexOn.success)
})

test('color-diff runtime switches syntax theme name and scope palette in codex mode', () => {
  const codexOn = runModuleJson({
    env: { CLAUDE_CODE_USE_CODEX_PROVIDER: '1' },
    code: `
      import { __test, getSyntaxTheme } from './src/native-ts/color-diff/index.ts'
      const theme = __test.buildTheme('dark', 'truecolor')
      console.log(JSON.stringify({
        syntaxTheme: getSyntaxTheme('dark').theme,
        keyword: theme.scopes.keyword,
        operator: theme.scopes.operator,
      }))
    `,
  })

  const codexOff = runModuleJson({
    env: { CLAUDE_CODE_USE_CODEX_PROVIDER: '0' },
    code: `
      import { __test, getSyntaxTheme } from './src/native-ts/color-diff/index.ts'
      const theme = __test.buildTheme('dark', 'truecolor')
      console.log(JSON.stringify({
        syntaxTheme: getSyntaxTheme('dark').theme,
        keyword: theme.scopes.keyword,
      }))
    `,
  })

  assert.equal(codexOn.syntaxTheme, 'Codex Dark')
  assert.deepEqual(codexOn.keyword, { r: 0, g: 179, b: 219, a: 255 })
  assert.deepEqual(codexOn.operator, { r: 0, g: 179, b: 219, a: 255 })
  assert.equal(codexOff.syntaxTheme, 'Monokai Extended')
  assert.notDeepEqual(codexOff.keyword, codexOn.keyword)
})

test('heatmap runtime legend color switches to codex accent in codex mode', () => {
  const commonCode = `
    import { generateHeatmap } from './src/utils/heatmap.ts'
    const out = generateHeatmap(
      [{ date: '2026-04-02', messageCount: 9 }],
      { terminalWidth: 28, showMonthLabels: false },
    )
    console.log(JSON.stringify({
      hasLegend: out.includes('Less ') && out.includes(' More'),
      hasCodexAccent: out.includes('\\u001b[38;2;0;179;219m'),
    }))
  `

  const codexOn = runModuleJson({
    env: {
      CLAUDE_CODE_USE_CODEX_PROVIDER: '1',
      FORCE_COLOR: '3',
      COLORTERM: 'truecolor',
    },
    code: commonCode,
  })

  const codexOff = runModuleJson({
    env: {
      CLAUDE_CODE_USE_CODEX_PROVIDER: '0',
      FORCE_COLOR: '3',
      COLORTERM: 'truecolor',
    },
    code: commonCode,
  })

  assert.equal(codexOn.hasLegend, true)
  assert.equal(codexOn.hasCodexAccent, true)
  assert.equal(codexOff.hasLegend, true)
  assert.equal(codexOff.hasCodexAccent, false)
})

test('tab status runtime maps busy/waiting presets to codex colors in codex mode', () => {
  const codexOn = runModuleJson({
    env: { CLAUDE_CODE_USE_CODEX_PROVIDER: '1' },
    code: `
      import { __test } from './src/ink/hooks/use-tab-status.ts'
      console.log(JSON.stringify({
        busy: __test.getTabStatusPreset('busy'),
        waiting: __test.getTabStatusPreset('waiting'),
      }))
    `,
  })

  const codexOff = runModuleJson({
    env: { CLAUDE_CODE_USE_CODEX_PROVIDER: '0' },
    code: `
      import { __test } from './src/ink/hooks/use-tab-status.ts'
      console.log(JSON.stringify({
        busy: __test.getTabStatusPreset('busy'),
        waiting: __test.getTabStatusPreset('waiting'),
      }))
    `,
  })

  assert.deepEqual(codexOn.busy.indicator, { type: 'rgb', r: 0, g: 179, b: 219 })
  assert.deepEqual(codexOn.busy.statusColor, { type: 'rgb', r: 0, g: 179, b: 219 })
  assert.deepEqual(codexOn.waiting.indicator, {
    type: 'rgb',
    r: 230,
    g: 180,
    b: 0,
  })
  assert.deepEqual(codexOn.waiting.statusColor, {
    type: 'rgb',
    r: 230,
    g: 180,
    b: 0,
  })
  assert.notDeepEqual(codexOff.busy.indicator, codexOn.busy.indicator)
  assert.notDeepEqual(codexOff.waiting.indicator, codexOn.waiting.indicator)
})

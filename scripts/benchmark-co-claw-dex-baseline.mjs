#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

function parseArg(flag, defaultValue) {
  const i = process.argv.indexOf(flag)
  if (i === -1 || i + 1 >= process.argv.length) return defaultValue
  return process.argv[i + 1]
}

function nowIso() {
  return new Date().toISOString()
}

function buildTaskSkeleton(taskId, category, prompt) {
  return {
    task_id: taskId,
    category,
    prompt,
    latency: {
      first_token_ms: null,
      task_done_ms: null,
    },
    stability: {
      timeout: false,
      retry_count: 0,
      interrupt_recovered: null,
    },
    quality: {
      auto_check_pass: null,
      reviewer_score_1_to_5: null,
      notes: '',
    },
    maintenance: {
      setup_minutes: null,
      harness_issues: [],
    },
  }
}

async function main() {
  const runner = parseArg('--runner', 'codex-code')
  const model = parseArg('--model', 'unset')
  const out = resolve(
    parseArg('--out', `artifacts/benchmark-co-claw-dex-baseline-${Date.now()}.json`),
  )

  const result = {
    run_id: `baseline-${Date.now()}`,
    timestamp: nowIso(),
    runner,
    model,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    tasks: [
      buildTaskSkeleton('edit-single-file', 'code-edit', 'Apply one targeted code edit and keep tests green.'),
      buildTaskSkeleton('edit-multi-file', 'code-edit', 'Complete one multi-file change with minimal side effects.'),
      buildTaskSkeleton('fix-failing-test', 'test-repair', 'Fix a failing test without regressions.'),
      buildTaskSkeleton('repair-flaky-test', 'test-repair', 'Stabilize a flaky test path.'),
      buildTaskSkeleton('tui-interrupt-continue', 'tui', 'Run one interrupt and continue flow in real TUI.'),
      buildTaskSkeleton('tui-slash-flow', 'tui', 'Validate one slash-command interaction flow.'),
      buildTaskSkeleton('docs-sync', 'docs', 'Update a doc section with code-consistent status.'),
      buildTaskSkeleton('summary-consistency', 'docs', 'Produce one consistent status summary from recent changes.'),
    ],
    aggregate: {
      latency_p50_ms: null,
      latency_p95_ms: null,
      pass_rate: null,
      timeout_rate: null,
    },
    notes:
      'Template baseline output. Fill metrics from real runs, then compare against co-claw-dex.',
  }

  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, JSON.stringify(result, null, 2) + '\n', 'utf8')
  process.stdout.write(`baseline template written: ${out}\n`)
}

main().catch(error => {
  process.stderr.write(`baseline script failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})


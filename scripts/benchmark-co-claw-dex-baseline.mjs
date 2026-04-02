#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

function parseArg(flag, defaultValue) {
  const i = process.argv.indexOf(flag)
  if (i === -1 || i + 1 >= process.argv.length) return defaultValue
  return process.argv[i + 1]
}

function nowIso() {
  return new Date().toISOString()
}

function truncateText(text, limit = 1200) {
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}...[truncated ${text.length - limit} chars]`
}

function percentile(sortedNumbers, p) {
  if (!sortedNumbers.length) return null
  const index = Math.ceil((p / 100) * sortedNumbers.length) - 1
  return sortedNumbers[Math.max(0, Math.min(index, sortedNumbers.length - 1))]
}

function defaultTasks() {
  return [
    {
      task_id: 'smoke-pass',
      category: 'smoke',
      prompt: 'Verify baseline harness can record a successful task.',
      command: "node -e \"console.log('baseline pass')\"",
      timeout_ms: 8000,
    },
    {
      task_id: 'smoke-fail',
      category: 'smoke',
      prompt: 'Verify baseline harness can record a failed task.',
      command: "node -e \"process.exit(2)\"",
      timeout_ms: 8000,
    },
  ]
}

async function loadTaskList(tasksPath) {
  if (!tasksPath) return defaultTasks()
  const raw = await readFile(resolve(tasksPath), 'utf8')
  const data = JSON.parse(raw)
  if (!Array.isArray(data)) {
    throw new Error('task list must be a JSON array')
  }
  return data
}

async function runOneTask(task, defaultTimeoutMs) {
  if (!task.task_id || !task.command) {
    return {
      task_id: task.task_id ?? 'unknown',
      category: task.category ?? 'unknown',
      prompt: task.prompt ?? '',
      status: 'fail',
      timeout_ms: task.timeout_ms ?? defaultTimeoutMs,
      duration_ms: 0,
      command: task.command ?? null,
      error: 'missing task_id or command',
      latency: { first_token_ms: null, task_done_ms: null },
      stability: { timeout: false, retry_count: 0, interrupt_recovered: null },
      quality: { auto_check_pass: false, reviewer_score_1_to_5: null, notes: 'task config invalid' },
      maintenance: { setup_minutes: null, harness_issues: ['invalid task config'] },
      output: { stdout: '', stderr: '' },
    }
  }

  const timeoutMs = Number(task.timeout_ms ?? defaultTimeoutMs)
  const startedAt = Date.now()

  return await new Promise(resolveTask => {
    let stdout = ''
    let stderr = ''
    let finished = false
    let timedOut = false

    const child = spawn(task.command, {
      shell: true,
      cwd: task.cwd ? resolve(task.cwd) : process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })

    const finish = (status, exitCode = null, signal = null) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      const duration = Date.now() - startedAt
      resolveTask({
        task_id: task.task_id,
        category: task.category ?? 'unknown',
        prompt: task.prompt ?? '',
        status,
        timeout_ms: timeoutMs,
        duration_ms: duration,
        command: task.command,
        exit_code: exitCode,
        signal,
        latency: {
          // No SDK/token streaming integration in stage 6 baseline script.
          first_token_ms: null,
          task_done_ms: duration,
        },
        stability: {
          timeout: timedOut,
          retry_count: Number(task.retry_count ?? 0),
          interrupt_recovered: null,
        },
        quality: {
          auto_check_pass: status === 'success',
          reviewer_score_1_to_5: null,
          notes: '',
        },
        maintenance: {
          setup_minutes: null,
          harness_issues: [],
        },
        output: {
          stdout: truncateText(stdout),
          stderr: truncateText(stderr),
        },
      })
    }

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 800).unref()
      finish('timeout', null, 'SIGTERM')
    }, timeoutMs)
    timer.unref()

    child.on('error', error => {
      stderr += `\nspawn error: ${error instanceof Error ? error.message : String(error)}`
      finish('fail', null, null)
    })

    child.on('close', (code, signal) => {
      if (timedOut) return
      if (code === 0) finish('success', 0, signal)
      else finish('fail', code, signal)
    })
  })
}

function buildAggregate(tasks) {
  const count = tasks.length
  const successCount = tasks.filter(t => t.status === 'success').length
  const timeoutCount = tasks.filter(t => t.status === 'timeout').length
  const durations = tasks.map(t => t.duration_ms).sort((a, b) => a - b)
  return {
    task_count: count,
    success_count: successCount,
    fail_count: count - successCount - timeoutCount,
    timeout_count: timeoutCount,
    pass_rate: count === 0 ? null : Number((successCount / count).toFixed(4)),
    timeout_rate: count === 0 ? null : Number((timeoutCount / count).toFixed(4)),
    latency_p50_ms: percentile(durations, 50),
    latency_p95_ms: percentile(durations, 95),
  }
}

function toSummaryMarkdown(result) {
  const lines = [
    '# co-claw-dex Baseline Run Summary',
    '',
    `- run_id: \`${result.run_id}\``,
    `- timestamp: ${result.timestamp}`,
    `- runner: \`${result.runner}\``,
    `- model: \`${result.model}\``,
    `- tasks_file: \`${result.tasks_file}\``,
    '',
    '## Aggregate',
    '',
    `- task_count: ${result.aggregate.task_count}`,
    `- success_count: ${result.aggregate.success_count}`,
    `- fail_count: ${result.aggregate.fail_count}`,
    `- timeout_count: ${result.aggregate.timeout_count}`,
    `- pass_rate: ${result.aggregate.pass_rate}`,
    `- timeout_rate: ${result.aggregate.timeout_rate}`,
    `- latency_p50_ms: ${result.aggregate.latency_p50_ms}`,
    `- latency_p95_ms: ${result.aggregate.latency_p95_ms}`,
    '',
    '## Tasks',
    '',
    '| task_id | category | status | duration_ms | timeout_ms | exit_code | signal |',
    '| --- | --- | --- | ---: | ---: | ---: | --- |',
  ]

  for (const task of result.tasks) {
    lines.push(
      `| ${task.task_id} | ${task.category} | ${task.status} | ${task.duration_ms} | ${task.timeout_ms} | ${task.exit_code ?? ''} | ${task.signal ?? ''} |`,
    )
  }

  lines.push('', '## Notes', '', result.notes)
  return `${lines.join('\n')}\n`
}

async function main() {
  const runner = parseArg('--runner', 'codex-code')
  const model = parseArg('--model', 'unset')
  const tasksPath = parseArg('--tasks', '')
  const defaultTimeoutMs = Number(parseArg('--task-timeout-ms', '30000'))
  const summaryMdPath = parseArg('--summary-md', '')
  const out = resolve(
    parseArg('--out', `artifacts/benchmark-co-claw-dex-baseline-${Date.now()}.json`),
  )

  const taskList = await loadTaskList(tasksPath)
  const taskResults = []
  for (const task of taskList) {
    // Sequential baseline keeps timing and logs easy to compare across runs.
    // Parallel mode can be added later if needed.
    // eslint-disable-next-line no-await-in-loop
    taskResults.push(await runOneTask(task, defaultTimeoutMs))
  }

  const result = {
    run_id: `baseline-${Date.now()}`,
    timestamp: nowIso(),
    runner,
    model,
    tasks_file: tasksPath ? resolve(tasksPath) : 'built-in-default-smoke',
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    tasks: taskResults,
    aggregate: buildAggregate(taskResults),
    notes:
      'Stage 6 baseline run. Compare JSON outputs directly between codex-code and co-claw-dex.',
  }

  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, JSON.stringify(result, null, 2) + '\n', 'utf8')
  if (summaryMdPath) {
    const summaryOut = resolve(summaryMdPath)
    await mkdir(dirname(summaryOut), { recursive: true })
    await writeFile(summaryOut, toSummaryMarkdown(result), 'utf8')
    process.stdout.write(`baseline summary written: ${summaryOut}\n`)
  }
  process.stdout.write(`baseline result written: ${out}\n`)
}

main().catch(error => {
  process.stderr.write(`baseline script failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})

# co-claw-dex Baseline Sample (One Real Run)

This page captures one real local run from the stage-6 baseline script.

## Sample Artifacts

- JSON result: `docs/examples/co-claw-dex-baseline-sample.json`
- Markdown summary: `docs/examples/co-claw-dex-baseline-sample-summary.md`
- Task list used: `docs/examples/co-claw-dex-tasks.sample.json`

## What the Main Fields Mean

Top-level:

- `run_id`: unique run identifier
- `timestamp`: run time in ISO format
- `runner`: side under test (for example `codex-code` or `co-claw-dex`)
- `model`: model label used for this run
- `tasks_file`: source task list path
- `tasks`: per-task results
- `aggregate`: computed summary metrics

Per task:

- `status`: `success` / `fail` / `timeout`
- `duration_ms`: wall-clock duration for the task execution
- `exit_code`, `signal`: process termination info
- `latency.task_done_ms`: stage-6 placeholder (equals `duration_ms`)
- `stability.timeout`: whether timeout happened on that task

## How to Read pass_rate / timeout_rate / latency

Using the current sample values:

- `pass_rate = 0.5`
  - 1 of 2 tasks succeeded.
  - Higher is better.
- `timeout_rate = 0.5`
  - 1 of 2 tasks hit timeout.
  - Lower is better.
- `latency_p50_ms = 34`
  - Typical completion time (median) is fast.
- `latency_p95_ms = 502`
  - Tail latency is much higher than p50 in this tiny sample.

When comparing against `co-claw-dex`, use the same tasks and read metrics together:

- Reliability first: lower `timeout_rate`
- Outcome second: higher `pass_rate`
- Speed third: lower `latency_p50_ms` and `latency_p95_ms`

## Reproduce This Sample

```bash
node scripts/benchmark-co-claw-dex-baseline.mjs \
  --runner codex-code \
  --model gpt-5.4 \
  --tasks ./docs/examples/co-claw-dex-tasks.sample.json \
  --out ./docs/examples/co-claw-dex-baseline-sample.json \
  --summary-md ./docs/examples/co-claw-dex-baseline-sample-summary.md
```

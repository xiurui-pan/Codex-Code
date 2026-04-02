# co-claw-dex Baseline Benchmark Plan (Stage 6)

This plan defines a runnable baseline for comparing Codex Code against `co-claw-dex` without SDK integration.

Current status:

- Stage 6 has moved past a pure outline.
- After `04995ec`, the baseline can record per-task runnable outcome state and aggregate summary metrics.
- This document is now the stage-six result-shape entry, not just a future TODO list.

## 1) Comparison Dimensions

We keep four dimensions only:

1. Latency
   - `first_token_ms`: time from submit to first visible token/event.
   - `task_done_ms`: time from submit to final usable answer.
2. Stability
   - timeout rate
   - retry count
   - interruption recovery (can continue after one interrupt)
3. Completion Quality
   - objective pass/fail checks per task
   - reviewer score (1-5) for answer usefulness and correctness
4. Maintenance Cost
   - setup complexity (files touched, manual steps)
   - test upkeep cost (how often the benchmark breaks due to harness drift)

## 2) Minimal Dataset

We start with a small but representative set (8 tasks):

- 2 code edit tasks (single-file + multi-file)
- 2 test repair tasks (fix failing test, keep unrelated tests green)
- 2 TUI interaction tasks (interrupt + continue, slash command flow)
- 2 docs/tasks tasks (update one doc + produce consistent summary)

Each task record should include:

- `task_id`
- `category`
- `prompt`
- `expected_checks` (machine-checkable assertions)
- `manual_review_notes`

## 3) Run Protocol

For each side (`codex-code`, `co-claw-dex`):

1. Use the same task set and same run order.
2. Record raw timing and outcome per task.
3. Save structured JSON results in one file per run.
4. Keep environment notes (Node version, machine info, date, model).

## 4) Result Format (Baseline)

The baseline run output should include:

- run metadata (`run_id`, `runner`, `timestamp`, `model`, `environment`)
- per-task metrics (`latency`, `stability`, `quality`)
- aggregated summary (p50/p95 latency, pass rate, timeout rate)
- maintenance notes (manual setup time, issues found)

Reference script: `scripts/benchmark-co-claw-dex-baseline.mjs`.

## 5) Current Stage 6 Capability

The baseline currently records:

- per-task status: `success` / `fail` / `timeout`
- per-task duration and exit result
- aggregate summary fields such as pass rate and timeout rate

This is enough to start accumulating comparable run history, even though the full 8-task benchmark set is still being filled in.

## 6) Exit Criteria for Stage 6 Baseline

Stage 6 baseline is considered in place when:

- the script runs locally and emits valid structured JSON
- the 8-task minimal dataset is defined and usable
- README/roadmap links to this plan and the script entry

## 7) Minimal Usage (No SDK)

Run with built-in smoke tasks:

```bash
node scripts/benchmark-co-claw-dex-baseline.mjs --runner codex-code --model gpt-5.4
```

Run with a custom task list:

```bash
node scripts/benchmark-co-claw-dex-baseline.mjs \
  --runner codex-code \
  --model gpt-5.4 \
  --tasks ./docs/examples/co-claw-dex-tasks.sample.json \
  --out ./artifacts/baseline-codex-code.json \
  --summary-md ./artifacts/baseline-codex-code-summary.md
```

Task list schema (JSON array, simple and local-run friendly):

```json
[
  {
    "task_id": "quick-pass",
    "category": "smoke",
    "prompt": "sample pass task",
    "command": "node -e \"console.log('ok')\"",
    "timeout_ms": 8000
  },
  {
    "task_id": "quick-timeout",
    "category": "smoke",
    "prompt": "sample timeout task",
    "command": "node -e \"setTimeout(() => {}, 60000)\"",
    "timeout_ms": 500
  }
]
```

Per-task output now includes:

- `status`: `success` | `fail` | `timeout`
- `duration_ms`
- `exit_code` / `signal`
- `latency.task_done_ms` placeholder (set to `duration_ms` in this stage)

## 7) Example Run Result Interpretation

Suppose a run has:

- `task_count = 8`
- `success_count = 6`
- `timeout_count = 1`
- `pass_rate = 0.75`
- `timeout_rate = 0.125`
- `latency_p50_ms = 1450`
- `latency_p95_ms = 5300`

Interpretation for baseline comparison:

- Stability is acceptable but timeout risk still exists (1/8).
- Typical latency is moderate (p50), but tail latency (p95) is high.
- If `co-claw-dex` has lower timeout rate and lower p95 on the same task file, it wins on reliability.
- If Codex Code has higher pass rate at similar latency, it wins on completion quality.

Use the JSON output for machine comparison and `--summary-md` output for quick human review in PRs.

Aggregate output now includes:

- total task count
- success / fail / timeout counts
- aggregate latency summary fields for the current run

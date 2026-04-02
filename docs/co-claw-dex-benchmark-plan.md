# co-claw-dex Baseline Benchmark Plan (Stage 6)

This plan defines a runnable baseline for comparing Codex Code against `co-claw-dex` without SDK integration.

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

## 5) Exit Criteria for Stage 6 Baseline

Stage 6 baseline is considered in place when:

- the script runs locally and emits valid structured JSON
- the 8-task minimal dataset is defined and usable
- README/roadmap links to this plan and the script entry


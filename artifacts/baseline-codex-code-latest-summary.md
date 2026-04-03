# co-claw-dex Baseline Run Summary

- run_id: `baseline-1775191017783`
- timestamp: 2026-04-03T04:36:57.783Z
- runner: `codex-code`
- model: `gpt-5.1-codex-mini`
- tasks_file: `/home/pxr/workspace/CodingAgent/Codex-Code/docs/examples/co-claw-dex-tasks.sample.json`

## Aggregate

- task_count: 8
- success_count: 8
- fail_count: 0
- timeout_count: 0
- pass_rate: 1
- timeout_rate: 0
- latency_p50_ms: 56589
- latency_p95_ms: 80769

## Tasks

| task_id | category | status | duration_ms | timeout_ms | exit_code | signal |
| --- | --- | --- | ---: | ---: | ---: | --- |
| tui-basic-loop | tui | success | 50163 | 120000 | 0 |  |
| tui-slash-followup | tui | success | 65186 | 120000 | 0 |  |
| tool-permission-allow | permissions | success | 75188 | 120000 | 0 |  |
| model-effort-switch | model | success | 80769 | 180000 | 0 |  |
| session-memory-resume | memory | success | 57640 | 120000 | 0 |  |
| auto-memory-default | memory | success | 45160 | 120000 | 0 |  |
| headless-stream-json | headless | success | 56589 | 120000 | 0 |  |
| codex-color-runtime | ui | success | 12285 | 60000 | 0 |  |

## Notes

Stage 6 baseline run. Compare JSON outputs directly between codex-code and co-claw-dex.

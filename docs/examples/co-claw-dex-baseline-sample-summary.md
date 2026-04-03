# co-claw-dex Baseline Run Summary

- run_id: `baseline-1775179930424`
- timestamp: 2026-04-03T01:32:10.424Z
- runner: `codex-code`
- model: `gpt-5.4`
- tasks_file: `/home/pxr/workspace/CodingAgent/Codex-Code/docs/examples/co-claw-dex-tasks.sample.json`

## Aggregate

- task_count: 2
- success_count: 1
- fail_count: 0
- timeout_count: 1
- pass_rate: 0.5
- timeout_rate: 0.5
- latency_p50_ms: 33
- latency_p95_ms: 502

## Tasks

| task_id | category | status | duration_ms | timeout_ms | exit_code | signal |
| --- | --- | --- | ---: | ---: | ---: | --- |
| quick-pass | smoke | success | 33 | 8000 | 0 |  |
| quick-timeout | smoke | timeout | 502 | 500 |  | SIGTERM |

## Notes

Stage 6 baseline run. Compare JSON outputs directly between codex-code and co-claw-dex.

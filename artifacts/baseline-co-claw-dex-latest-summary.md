# co-claw-dex Baseline Run Summary

- run_id: `baseline-1775191895756`
- timestamp: 2026-04-03T04:51:35.756Z
- runner: `co-claw-dex`
- model: `gpt-5.4`
- tasks_file: `/home/pxr/workspace/CodingAgent/Codex-Code/docs/examples/co-claw-dex-native-tasks.sample.json`

## Aggregate

- task_count: 8
- success_count: 8
- fail_count: 0
- timeout_count: 0
- pass_rate: 1
- timeout_rate: 0
- latency_p50_ms: 1247
- latency_p95_ms: 1921

## Tasks

| task_id | category | status | duration_ms | timeout_ms | exit_code | signal |
| --- | --- | --- | ---: | ---: | ---: | --- |
| model-api-contract | model | success | 1921 | 120000 | 0 |  |
| model-config | model | success | 1251 | 120000 | 0 |  |
| responses-backend | headless | success | 1473 | 120000 | 0 |  |
| remote-permission-bridge | permissions | success | 1219 | 120000 | 0 |  |
| sdk-message-adapter | protocol | success | 1239 | 120000 | 0 |  |
| remote-session-manager | session | success | 1193 | 120000 | 0 |  |
| tool-execution | tool | success | 1297 | 120000 | 0 |  |
| tool-orchestration | tool | success | 1247 | 120000 | 0 |  |

## Notes

Stage 6 baseline run. Compare JSON outputs directly between codex-code and co-claw-dex.

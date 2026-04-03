# Codex Code vs co-claw-dex Local Comparison

## Scope

This is the first paired local comparison package for the roadmap comparative track.

It is intentionally split into two runnable task packs because the two repositories expose different direct acceptance harnesses:

- `codex-code`: real-chain acceptance-backed pack in `docs/examples/co-claw-dex-tasks.sample.json`
- `co-claw-dex`: repository-native P0 verification pack in `docs/examples/co-claw-dex-native-tasks.sample.json`

This means the numbers are useful for a same-machine local baseline, but they are not a strict apples-to-apples measurement of identical commands.

## Aggregate Snapshot

| Runner | Run ID | Task Pack | task_count | success_count | fail_count | timeout_count | pass_rate | timeout_rate | latency_p50_ms | latency_p95_ms |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| codex-code | `baseline-1775191017783` | acceptance-backed real-chain pack | 8 | 8 | 0 | 0 | 1 | 0 | 56589 | 80769 |
| co-claw-dex | `baseline-1775191895756` | repository-native P0 verification pack | 8 | 8 | 0 | 0 | 1 | 0 | 1247 | 1921 |

## Readout

- `codex-code` current pack is heavier: it runs real TTY / slash / permission / memory / headless / color acceptance commands, so latency is dominated by end-to-end verification cost.
- `co-claw-dex` current pack is lighter: it runs repository-native P0 tests around model, protocol, permissions, session, and tool contracts.
- Both sides are now reproducibly runnable on the same machine and both current packs finish with `pass_rate = 1` and `timeout_rate = 0`.
- The next tightening step, if needed later, is to replace the repo-native split with a stricter same-scenario external comparison harness.

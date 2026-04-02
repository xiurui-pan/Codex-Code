# Capability Acceptance Matrix (Codex-only)

This document is the canonical board for capability-level acceptance.

Rule:

- Compare against the official Claude Code capability list.
- For Codex Code, Anthropic-only product capabilities are tracked but marked out-of-scope.
- Every "pass" must link to reproducible evidence (test file, command, or transcript).

## Status Legend

- `done`: accepted with reproducible evidence
- `in-progress`: partially validated, more cases needed
- `pending`: not validated yet
- `out-of-scope`: Anthropic-only product path, intentionally not in Codex-only mainline

## Matrix (updated)

| Capability Area | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| Core interaction | TUI basic prompt/response loop | in-progress | `upstream/claude-code/tests/tuiSmoke.smoke.mjs` | expand stability coverage |
| Slash commands | Core local slash command set | in-progress | `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs` | `/files` `/plan` `/agents` `/plugin` `/reload-plugins` `/ide` already have evidence; wider multi-state coverage still pending |
| Slash commands | `/agents` local TUI acceptance | done | `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs` | covers local acceptance and no provider traffic |
| Slash commands | `/plugin` local TUI acceptance | done | `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs` | covers local acceptance and no provider traffic |
| Slash commands | `/reload-plugins` local TUI acceptance | done | `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs` | covers local reload result and no provider traffic |
| Slash commands | `/ide` local TUI acceptance | done | `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs` | covers local acceptance and no provider traffic |
| Slash commands | `/files` and `/plan` local TUI acceptance | done | `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs` | covers minimal local feedback paths without provider traffic |
| Slash commands | plan mode minimal TUI chain | done | `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs` | fixed by `45949c3`; current evidence is enter plan mode then re-run `/plan` to read empty current-plan status |
| Slash commands | plan mode resume existing plan subcase | in-progress | `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs` | kept as `test.skip`; blocked by resume 后 plan slug 恢复与关联时序不稳定 |
| TUI stability | interrupt 后 `/exit` 仍可正常退出 | done | `upstream/claude-code/tests/tuiKeyboardInputAcceptance.test.mjs` | fixed by `9afabd4`; new regression covers the post-interrupt `/exit` path |
| TUI stability | 多轮稳定性：round1 成功 + round2 中断 + `/exit` 退出 | done | `upstream/claude-code/tests/tuiMultiTurnStabilityAcceptance.test.mjs` | fixed by `b21ff65`; current evidence stops at interrupt then exit, not third-round auto coverage |
| TUI stability | `/help` Esc dismiss restores footer state | done | `upstream/claude-code/tests/helpDismissTuiAcceptance.test.mjs` | fixed by `fbc85e3` |
| TUI stability | auto-update fallback message when package URL is missing | done | `upstream/claude-code/tests/autoUpdaterMessages.test.ts` | fixed by `ca7b9d3` |
| TUI stability | narrow terminal mixed-language input keeps completion focus stable | done | `upstream/claude-code/tests/tuiDisplayInteractionAcceptance.test.mjs` | added by `b4cebc3`, stabilized by `c7d136c` |
| TUI stability | long output + transcript toggle returns focus for next submit | done | `upstream/claude-code/tests/tuiDisplayInteractionAcceptance.test.mjs` | added by `b4cebc3`, stabilized by `c7d136c` |
| Provider chain | silent stream timeout gives explicit error (no silent hang) | done | `upstream/claude-code/tests/codexResponsesTimeoutProvider.test.mjs` | fixed by `c7e97ed` |
| Provider chain | request-stage timeout gives explicit error | done | `upstream/claude-code/tests/codexResponsesTimeoutProvider.test.mjs` | fixed by `bf0555e` |
| Permissions | Host permission request/decision flow | in-progress | `upstream/claude-code/tests/tuiPermissionTranscriptAcceptance.test.mjs` | include more tool categories |
| Memory | Session memory inject + compact/resume | in-progress | `upstream/claude-code/tests/sessionMemoryContext.behavior.mjs` | add longer multi-session cases |
| Memory | Auto memory injection | in-progress | `upstream/claude-code/tests/autoMemoryAcceptance.test.mjs` | continue scope edge validation |
| Context docs | CLAUDE.md / @import / @文件引用 enter the real request body | done | `upstream/claude-code/tests/claudeMdAcceptance.test.mjs` | `f35380d` fixed the Codex request-body path so file refs are no longer dropped |
| Headless | Headless capability matrix | in-progress | `upstream/claude-code/tests/headlessAcceptanceMatrix.test.mjs` | align rows with official list |
| Model controls | model + reasoning effort behavior | in-progress | `upstream/claude-code/tests/modelEffortTuiAcceptance.test.mjs` | add full switch/cancel matrix |
| Anthropic product | claude.ai auth/OAuth/Bridge/proactive | out-of-scope | `docs/roadmap.md` | excluded in Codex-only phase |
| Comparative track | co-claw-dex performance/effectiveness comparison | pending | n/a | will add benchmark protocol and dataset |

## Maintenance Rules

- Update this table whenever a related acceptance test is added or changed.
- Do not mark `done` without a command that others can rerun.
- Keep out-of-scope items visible to avoid hidden scope drift.

## Next Acceptance Commands

- `cd upstream/claude-code && node --test tests/tuiKeyboardInputAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/tuiMultiTurnStabilityAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/helpDismissTuiAcceptance.test.mjs tests/autoUpdaterMessages.test.ts tests/codexResponsesTimeoutProvider.test.mjs`
- `cd upstream/claude-code && node --test tests/tuiDisplayInteractionAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/claudeMdAcceptance.test.mjs`

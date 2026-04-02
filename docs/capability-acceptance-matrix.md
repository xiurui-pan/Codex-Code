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
| Slash commands | Core local slash command set | in-progress | `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs` | continue broadening command coverage |
| TUI stability | `/help` Esc dismiss restores footer state | done | `upstream/claude-code/tests/helpDismissTuiAcceptance.test.mjs` | fixed by `fbc85e3` |
| TUI stability | auto-update fallback message when package URL is missing | done | `upstream/claude-code/tests/autoUpdaterMessages.test.ts` | fixed by `ca7b9d3` |
| Provider chain | silent stream timeout gives explicit error (no silent hang) | done | `upstream/claude-code/tests/codexResponsesTimeoutProvider.test.mjs` | fixed by `c7e97ed` |
| Provider chain | request-stage timeout gives explicit error | done | `upstream/claude-code/tests/codexResponsesTimeoutProvider.test.mjs` | fixed by `bf0555e` |
| Permissions | Host permission request/decision flow | in-progress | `upstream/claude-code/tests/tuiPermissionTranscriptAcceptance.test.mjs` | include more tool categories |
| Memory | Session memory inject + compact/resume | in-progress | `upstream/claude-code/tests/sessionMemoryContext.behavior.mjs` | add longer multi-session cases |
| Memory | Auto memory injection | in-progress | `upstream/claude-code/tests/autoMemoryAcceptance.test.mjs` | continue scope edge validation |
| Context docs | CLAUDE.md and import chain injection | in-progress | `upstream/claude-code/tests/claudeMdAcceptance.test.mjs` | add deep import permutations |
| Headless | Headless capability matrix | in-progress | `upstream/claude-code/tests/headlessAcceptanceMatrix.test.mjs` | align rows with official list |
| Model controls | model + reasoning effort behavior | in-progress | `upstream/claude-code/tests/modelEffortTuiAcceptance.test.mjs` | add full switch/cancel matrix |
| Anthropic product | claude.ai auth/OAuth/Bridge/proactive | out-of-scope | `docs/roadmap.md` | excluded in Codex-only phase |
| Comparative track | co-claw-dex performance/effectiveness comparison | pending | n/a | will add benchmark protocol and dataset |

## Maintenance Rules

- Update this table whenever a related acceptance test is added or changed.
- Do not mark `done` without a command that others can rerun.
- Keep out-of-scope items visible to avoid hidden scope drift.

## Next Acceptance Commands

- `cd upstream/claude-code && pnpm build`
- `cd upstream/claude-code && node --test tests/autoUpdaterMessages.test.ts`
- `cd upstream/claude-code && node --test tests/helpDismissTuiAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/codexResponsesTimeoutProvider.test.mjs`

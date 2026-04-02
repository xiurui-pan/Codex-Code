# Progress Log (Codex-only Convergence)

## Current Position

The project has moved from "provider adapter" work into **Codex-only runtime convergence**.

What this means in practice:

- TUI, headless flow, tool execution, and permission flow remain in active use.
- Mainline migration goal is no longer "make Claude-shaped output look usable".
- Mainline goal is "make Codex-shaped runtime objects first-class".

## Recent 4 Commits (ca7b9d3, fbc85e3, c7e97ed, bf0555e)

- `ca7b9d3`: fixed auto-update failure hint fallback when package URL is undefined; recovery command is now stable and explicit.
- `fbc85e3`: fixed `/help` dismiss flow so `Esc` closes help and footer state returns to normal shortcut hint.
- `c7e97ed`: fixed silent provider stream hang by adding fail-fast path in Codex responses stream handling.
- `bf0555e`: added request-stage timeout in Codex responses request chain, so waiting-for-response hang now returns explicit error.

## Real TUI Issue Status

Found and addressed:

- auto-update undefined package URL produced unstable recovery guidance.
- `/help` + `Esc` could leave footer hint in wrong state.
- provider SSE stream could stay silent and block output without clear feedback.
- request stage could wait too long without explicit timeout feedback.

Current behavior:

- provider unreachable / silent stream / request-stage timeout now returns explicit provider error text instead of silent waiting.

## Done (Scope and Direction)

- Confirmed project target: Codex-only client, custom Codex provider first.
- Explicitly documented this is not a prompt-only rewrite.
- Re-centered docs on runtime-level migration tasks.
- Started maintaining a dedicated capability acceptance matrix entry point:
  - `docs/capability-acceptance-matrix.md`

## Anthropic / Account-Risk Logic Boundary

### Already removed from mainline target

- Anthropic-first architecture decisions as default direction
- claude.ai subscription assumptions for required core paths
- anti-distillation and account-risk signal handling as migration objective
- GrowthBook/Anthropic rollout dependency as "must keep" requirement

### Still pending cleanup

- residual Claude/Anthropic naming in user-facing text
- leftover compatibility wrappers around Claude-shaped event structures
- stale branch descriptions that imply Anthropic-only features are still in Codex mainline plan

## Why Not "Just Prompt Changes"

Progress shows repeated runtime-level work that prompts alone cannot replace:

- turn item normalization
- execution object handling
- permission object chain
- compact/resume memory boundaries
- testable TUI/headless state behavior

This is the reason roadmap/progress now tracks object-model and lifecycle convergence explicitly.

## New Mandatory Acceptance Line

From now on, capability acceptance must be tracked row by row against the official capability list:

- canonical board: `docs/capability-acceptance-matrix.md`
- supporting evidence: acceptance tests and checklist docs
- pass condition: reproducible evidence, not narrative-only status

## Still Pending and Next Acceptance Commands

Still pending:

- broader multi-round real TUI soak for repeated prompt cycles under unstable network.
- wider slash-command matrix completion in the same run (utility commands already split into dedicated tests).

Next command set:

- `cd upstream/claude-code && pnpm build`
- `cd upstream/claude-code && node --test tests/autoUpdaterMessages.test.ts`
- `cd upstream/claude-code && node --test tests/helpDismissTuiAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/codexResponsesTimeoutProvider.test.mjs`

## Long-Term Track Added

A dedicated comparative track against `co-claw-dex` is now part of planning scope:

- performance (latency/stability/retry)
- effectiveness (task completion quality)
- implementation and maintenance cost

## Next Update Rule

Each progress update should include:

- what changed in scope (if any)
- what was removed vs what is still pending
- which matrix rows moved status and what evidence was added
- whether `co-claw-dex` comparison dataset changed

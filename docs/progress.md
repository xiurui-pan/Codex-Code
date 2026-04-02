# Progress Log (Codex-only Convergence)

## Current Position

The project has moved from "provider adapter" work into **Codex-only runtime convergence**.

What this means in practice:

- TUI, headless flow, tool execution, and permission flow remain in active use.
- Mainline migration goal is no longer "make Claude-shaped output look usable".
- Mainline goal is "make Codex-shaped runtime objects first-class".

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

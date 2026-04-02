# Codex Code Roadmap (Codex-only)

## 1) Project Target

This project is converging to a **Codex-only client**.

Core definition:

- Keep local product strengths from `claude-code`: TUI loop, tool execution, permission flow, transcript lifecycle.
- Replace Claude/Anthropic-shaped runtime assumptions with Codex-native objects and behavior.
- Keep migration scope focused: custom Codex provider first, no broad multi-provider abstraction in this phase.

## 2) Why This Is Not Prompt-Only Work

The hard part is runtime semantics, not wording:

- message/event shape normalization
- tool call and tool result boundaries
- permission request/decision object chain
- state machine behavior across TUI and headless mode
- session memory compact/resume consistency

So this roadmap tracks **runtime convergence**, not only prompt edits.

## 3) Anthropic and Account-Risk Logic Status

### 3.1 Removed or explicitly out of Codex mainline

- Anthropic-first product path as architecture center
- claude.ai subscription gate assumptions for core capability paths
- anti-distillation and account-risk signal handling as migration goals
- treating GrowthBook/Anthropic rollout logic as required for Codex runtime correctness

### 3.2 Pending removal / continued shrink

- residual Claude/Anthropic naming in imported UI and docs
- compatibility shims that still preserve Claude-shaped event objects in internal boundaries
- low-value Anthropic-specific branches that are no longer part of Codex acceptance scope

## 4) Phased Plan

### Phase A - Runtime Core Convergence (in progress)

- Continue replacing Claude-shaped turn/event compatibility layers.
- Keep TUI/headless/permission paths stable while replacing internals.
- Reduce synthetic compatibility wrappers on hot paths.
- Provider narrowing is now in active convergence work: first cut (`b87593a`) makes Codex-only selection win over legacy provider flags, and second cut (`5a3b315`) narrows two API-layer first-party feature gates to a dedicated helper path.

### Phase B - Capability Acceptance Matrix (active)

- Use `docs/capability-acceptance-matrix.md` as the canonical acceptance board.
- Validate item by item against the official Claude Code capability list.
- Exclude Anthropic-only product features from "must pass" target set.

### Phase C - Product Surface Cleanup

- Complete Codex naming cleanup in user-facing surfaces.
- Remove stale docs and stale route descriptions that imply Anthropic product dependencies.

### Phase D - Comparative Evaluation

- Add long-run benchmark and quality comparison against `co-claw-dex`.
- Compare not just feature presence but also latency, stability, and task outcome quality.
- Stage 6 is no longer only a planning shell: `04995ec` upgrades it to a runnable baseline that can record per-task state (`success` / `fail` / `timeout`) and aggregate summary metrics.

## 4.1 Still Not Closed Yet

- plan mode 的 `resume existing plan` 真实时序仍不稳定；当前保留 `test.skip`，不把它记成已验。

## 5) Definition of Done for This Roadmap Track

A roadmap checkpoint is considered complete only when:

- docs reflect current scope truthfully (no stale Anthropic promise in Codex-only mainline)
- acceptance matrix row status is updated with evidence
- related TUI/headless tests are reproducible
- progress log is updated with concrete "done / pending" boundary

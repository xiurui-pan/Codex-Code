# Progress Log (Codex-only Convergence)

## Current Position

The project has moved from "provider adapter" work into **Codex-only runtime convergence**.

What this means in practice:

- TUI, headless flow, tool execution, and permission flow remain in active use.
- Mainline migration goal is no longer "make Claude-shaped output look usable".
- Mainline goal is "make Codex-shaped runtime objects first-class".

## Recent Convergence Commits (45949c3, f35380d, b4cebc3, c7d136c)

- `45949c3`: closed the minimal `/plan` TUI chain; current evidence is "enter plan mode -> re-run `/plan` -> see empty current-plan status", while the "resume existing plan" subcase remains skipped.
- `f35380d`: fixed the Codex request-body path so `@文件引用` now really enters the request body, with evidence in `upstream/claude-code/tests/claudeMdAcceptance.test.mjs`.
- `b4cebc3`: added stage-five wider TUI display acceptance for narrow terminal mixed-language input and transcript-toggle focus return.
- `c7d136c`: stabilized the TUI display interaction flow so the new wider display tests can run deterministically.

## Real TUI Issue Status

Found and addressed:

- interrupt 后 `/exit` 不退出的问题已经修复。
- 多轮稳定性当前已有自动化证据：round1 成功、round2 中断，然后 `/exit` 正常退出。
- auto-update undefined package URL produced unstable recovery guidance.
- `/help` + `Esc` could leave footer hint in wrong state.
- provider SSE stream could stay silent and block output without clear feedback.
- request stage could wait too long without explicit timeout feedback.

Current behavior:

- interrupt 之后再次执行 `/exit`，现在会正常退出；对应回归用例已加到 `upstream/claude-code/tests/tuiKeyboardInputAcceptance.test.mjs`。
- 多轮真实 TUI 稳定性当前以 `upstream/claude-code/tests/tuiMultiTurnStabilityAcceptance.test.mjs` 留证；覆盖范围明确是“round1 成功 + round2 中断 + `/exit` 退出”，不是第三轮再提问已自动化覆盖。
- provider unreachable / silent stream / request-stage timeout now returns explicit provider error text instead of silent waiting.
- `@文件引用` 现在已经不只是 UI 提示，而是会真实进入 Codex 请求体；证据在 `upstream/claude-code/tests/claudeMdAcceptance.test.mjs`。
- plan mode 当前状态是“最小链路已验”；`resume existing plan` 子用例仍然 skip，原因是 resume 后 plan slug 恢复与关联时序还不稳定。
- TUI 宽场景新增两项自动化证据：窄终端中英混输 + 补全焦点稳定，以及长输出 + transcript 进出后的焦点恢复；证据在 `upstream/claude-code/tests/tuiDisplayInteractionAcceptance.test.mjs`。

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
- wider slash-command matrix completion in broader interaction scenes; `/files` `/plan` `/agents` `/plugin` `/reload-plugins` `/ide` already have minimal local TUI evidence.
- plan mode 的 `resume existing plan` 子用例仍未收口，当前继续以 skip 保留，避免把不稳定时序误记成已验。

Next command set:

本轮已复验通过：

- `cd upstream/claude-code && node --test tests/tuiKeyboardInputAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/tuiMultiTurnStabilityAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/helpDismissTuiAcceptance.test.mjs tests/autoUpdaterMessages.test.ts tests/codexResponsesTimeoutProvider.test.mjs`
- `cd upstream/claude-code && node --test tests/tuiDisplayInteractionAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/claudeMdAcceptance.test.mjs`

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

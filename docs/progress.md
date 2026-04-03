# Progress Log (Codex-only Convergence)

## Current Position

The project has moved from "provider adapter" work into **Codex-only runtime convergence**.

What this means in practice:

- TUI, headless flow, tool execution, and permission flow remain in active use.
- Mainline migration goal is no longer "make Claude-shaped output look usable".
- Mainline goal is "make Codex-shaped runtime objects first-class".
- 2026-04-03 当前代码再次实测后，headless 最小 `-p` 闭环已经恢复；真实“读目录并总结”场景也会直接走工具链。
- 2026-04-03 当前代码再次实测后，自然语言联网搜索也已收口：正常对话直接走 Codex 原生 `web_search`，并能看到搜索开始/完成进度。

## Recent Convergence Commits (04995ec, b87593a, 5a3b315)

- `04995ec`: upgraded stage six from a plan skeleton to a runnable baseline that can record per-task outcome state and aggregate benchmark metrics.
- `b87593a`: landed provider narrowing first cut so Codex-only provider selection wins over legacy provider flags, with proof in `upstream/claude-code/tests/providersBehavior.test.mjs`.
- `5a3b315`: landed provider narrowing second cut by replacing two API-layer first-party gates with the narrowed helper path, again covered by `upstream/claude-code/tests/providersBehavior.test.mjs`.

## Real TUI Issue Status

Found and addressed:

- interrupt 后 `/exit` 不退出的问题已经修复。
- 多轮稳定性当前已有自动化证据：round1 成功、round2 中断，然后 `/exit` 正常退出。
- auto-update undefined package URL produced unstable recovery guidance.
- `/help` + `Esc` could leave footer hint in wrong state.
- provider SSE stream could stay silent and block output without clear feedback.
- request stage could wait too long without explicit timeout feedback.

Current behavior:

- 最小真实 TTY 主链已复验通过：启动、出现 prompt、一轮问答、正常退出；证据在 `upstream/claude-code/tests/tuiSmoke.smoke.mjs`。
- model / reasoning effort 的真实 TUI 切换链路已收口；切换确认、Esc 取消、`/effort` 状态一致都已留证，证据在 `upstream/claude-code/tests/modelEffortTuiAcceptance.test.mjs`。
- session memory 与 auto memory 两条主链已复验通过；证据分别在 `upstream/claude-code/tests/sessionMemoryContext.behavior.mjs` 和 `upstream/claude-code/tests/autoMemoryAcceptance.test.mjs`。
- Codex 色板对齐现在已有运行时证据，不再只是源码字符串判断；覆盖 `theme`、`color-diff`、`heatmap`、`tab-status`，证据在 `upstream/claude-code/tests/codexColorPalette.test.mjs`。
- interrupt 之后再次执行 `/exit`，现在会正常退出；对应回归用例已加到 `upstream/claude-code/tests/tuiKeyboardInputAcceptance.test.mjs`。
- 多轮真实 TUI 稳定性当前以 `upstream/claude-code/tests/tuiMultiTurnStabilityAcceptance.test.mjs` 留证；覆盖范围明确是“round1 成功 + round2 中断 + `/exit` 退出”，不是第三轮再提问已自动化覆盖。
- provider unreachable / silent stream / request-stage timeout now returns explicit provider error text instead of silent waiting.
- `@文件引用` 现在已经不只是 UI 提示，而是会真实进入 Codex 请求体；证据在 `upstream/claude-code/tests/claudeMdAcceptance.test.mjs`。
- plan mode 当前状态已从“最小链路已验”推进到“resume existing plan 子用例已收口”；`--resume <jsonl>` 后再次 `/plan` 可读取旧计划内容，已纳入自动化留证。
- TUI 宽场景新增两项自动化证据：窄终端中英混输 + 补全焦点稳定，以及长输出 + transcript 进出后的焦点恢复；证据在 `upstream/claude-code/tests/tuiDisplayInteractionAcceptance.test.mjs`。
- provider 收窄第二刀已经落地；Codex-only 路径下，API 预处理和请求参数构建不再靠 `getAPIProvider() === 'firstParty'` 的旧判断触发，证据在 `upstream/claude-code/tests/providersBehavior.test.mjs`。
- 阶段六已经从“只有骨架说明”升级为“可记录每任务状态与聚合指标”的可执行基线。
- local slash 主链已补到“多状态 + 后续普通提问”闭环；证据仍在 `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs`。
- headless capability matrix 已复验通过；并且最小真实 `-p` 闭环 `Reply with exactly: ok` 已在当前代码再次确认恢复，证据在 `upstream/claude-code/tests/headlessAcceptanceMatrix.test.mjs`。
- permission 这条已拆清边界：工具权限链路已验收，host 沙箱权限由于当前仓库未包含 `@anthropic-ai/sandbox-runtime`，不再假装是同一条本地能力。
- 真实“请读取当前目录的所有文件然后告诉我”场景已经不再先来回解释，而是直接进入 `Bash` / `Agent` / `Read` 工具链；同时修掉了 subagent 默认 `sonnet/haiku` 在 Codex provider 下不可用的问题，以及缺失 ripgrep 二进制导致的 `Glob` / `Grep` 主链失败。
- 联网搜索链路现在的真实状态已更新：正常对话不再先走本地 `WebSearch` 函数工具，而是直接暴露 Codex 原生 `web_search`；`stream-json` 复验能看到 `正在联网搜索...` / `联网搜索已完成...`，最后返回最终答案。

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
- 联网搜索真实自然语言场景；已通过真实命令收口，阻塞已从提供方故障转成已完成项。

Next command set:

本轮已复验通过：

- `cd upstream/claude-code && node --test tests/tuiKeyboardInputAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/tuiMultiTurnStabilityAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/helpDismissTuiAcceptance.test.mjs tests/autoUpdaterMessages.test.ts tests/codexResponsesTimeoutProvider.test.mjs`
- `cd upstream/claude-code && node --test tests/tuiDisplayInteractionAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/claudeMdAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/providersBehavior.test.mjs`
- `cd upstream/claude-code && node --test --test-name-pattern "resume restores existing plan content" tests/coreSlashCommandsAcceptance.test.mjs`

## Long-Term Track Added

A dedicated comparative track against `co-claw-dex` is now part of planning scope:

- performance (latency/stability/retry)
- effectiveness (task completion quality)
- implementation and maintenance cost

Latest local baseline artifact (2026-04-03):

- `artifacts/baseline-codex-code-latest.json`
- `artifacts/baseline-codex-code-latest-summary.md`
- command: `node scripts/benchmark-co-claw-dex-baseline.mjs --runner codex-code --model gpt-5.1-codex-mini --out artifacts/baseline-codex-code-latest.json --summary-md artifacts/baseline-codex-code-latest-summary.md`
- snapshot: `run_id = baseline-1775191017783`, `task_count = 8`, `pass_rate = 1`, `timeout_rate = 0`, `latency_p50_ms = 56589`, `latency_p95_ms = 80769`
- paired comparison: `artifacts/baseline-co-claw-dex-latest.json`, `artifacts/baseline-co-claw-dex-latest-summary.md`, `artifacts/co-claw-dex-vs-codex-code-comparison.md`
- paired snapshot: `co-claw-dex` `run_id = baseline-1775191895756`, `task_count = 8`, `pass_rate = 1`, `timeout_rate = 0`, `latency_p50_ms = 1247`, `latency_p95_ms = 1921`
- interpretation: 当前 comparative track 已经有首个可复跑的本地成对对照包；如果后续还要继续收紧，下一步应该换成两边更严格的“同场景对照”，而不是继续停留在单边 baseline。

## Next Update Rule

Each progress update should include:

- what changed in scope (if any)
- what was removed vs what is still pending
- which matrix rows moved status and what evidence was added
- whether `co-claw-dex` comparison dataset changed

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
- 2026-04-03 local proof run has been recorded at `artifacts/baseline-codex-code-latest.json` and `artifacts/baseline-codex-code-latest-summary.md`.
- 2026-04-03 首个本地成对对照包已经落地：Codex Code `baseline-1775191017783` 和 `co-claw-dex` `baseline-1775191895756` 都已记录，并且有并排结论文档 `artifacts/co-claw-dex-vs-codex-code-comparison.md`。
- 当前限制也已写清：这第一版成对对照使用的是两边各自可直接复跑的任务包，不是“两边完全同命令”的严格外部对照。

## 4.1 Recently Closed

- plan mode 的 `resume existing plan` 已在真实 TUI 链路收口；对应用例已从 skip 放开并纳入常规验收。
- 最小真实 TTY 主链、memory / auto-memory 主链、model / effort 切换链路已在 2026-04-03 复验收口。
- Codex 色板对齐已有运行时验收证据，不再只靠源码字符串匹配。
- local slash 主链与 headless capability matrix 已在 2026-04-03 收口；permission 边界也已拆清为“工具权限已验 / host 沙箱权限不在当前本地路线内”。
- 真实“读目录并总结”场景已经回到直接工具调用主链；同时修掉了 Codex provider 下 subagent 默认模型别名不兼容和缺失 ripgrep 二进制导致的搜索主链失败。
- 自然语言联网搜索已在 2026-04-03 收口：正常对话直接暴露 Codex 原生 `web_search`，并能在 CLI 输出里看到搜索开始/完成进度。
- 2026-04-04 真实 `/sandbox` 路径已从“误报 Linux 不支持”推进到真实本地 slash-command 状态路径；放开平台判定后暴露出的 fallback `checkDependencies()` 异步崩溃也已修复。
- 2026-04-04 direct/ssh 远端权限取消残留与 `VirtualMessageList` 中段重排滚动错位的本地修复均已落地。
- 2026-04-04 Claude / Anthropic 业务 slash 命令清扫继续收口：`/mobile`、`/chrome`、`/usage`、`/install-github-app`、`/web-setup`、`/remote-control` 已从 Codex 模式的真实 TUI 可用面移除，同时 `/plan`、`/model status`、`/theme`、`/copy` 的保留命令链路已做过新一轮真实 PTY 留证。

## 4.2 Current Remaining Gap

- 当前没有新的 P0 阻塞；联网搜索已从未完成项转为已完成项。
- `/sandbox` 还缺完整配置界面的真实 TUI 留证。
- direct/ssh 远端权限取消这条还缺真实远端会话验收，当前只完成了代码修复。
- 真实 Codex provider 长任务虽然已再次证明“可提交并进入工作态”，但 PTY 工具流转录还需要继续收紧。
- slash 命令的真实 PTY 扫描还没做完全部保留命令；当前新补的留证只覆盖 `/plan`、`/model status`、`/theme`、`/copy` 和业务命令移除面。

## 5) Definition of Done for This Roadmap Track

A roadmap checkpoint is considered complete only when:

- docs reflect current scope truthfully (no stale Anthropic promise in Codex-only mainline)
- acceptance matrix row status is updated with evidence
- related TUI/headless tests are reproducible
- progress log is updated with concrete "done / pending" boundary

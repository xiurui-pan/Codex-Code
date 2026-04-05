# Progress Log (Codex-only Convergence)

## Current Position

The project has completed **Codex provider TUI convergence** — the main runtime loop, streaming pipeline, token tracking, and agent output propagation are all working end-to-end with the Codex provider.

What this means in practice:

- TUI, headless flow, tool execution, and permission flow all working on Codex provider.
- Streaming pipeline shows thinking duration, token counter, and context window percentage.
- Agent/subagent results propagate correctly (main model reads agent output).
- Token usage and cost tracking working via `response.completed` usage events.
- Session memory and compaction stable.
- headless `-p` mode stable.

### Key Commits

| Commit | Description |
|---|---|
| `1d92184` | Thinking duration, context window %, agent output, tool status messages, session memory dedup |
| `e40ad09` | `/cost` command and background shell crash fix |
| `2bbca9e` | Complete Codex-only fork with all convergence fixes |

### Uncommitted Fixes (post-1d92184)

| File | Change |
|---|---|
| `SpinnerAnimationRow.tsx` | Removed `totalTokens > 0` guard so token count displays from stream start |
| `query.ts` | Removed duplicate session memory injection (already added before turn) |
| `modelTurnItems.ts` | Simplified tool status messages — null returns instead of empty system messages |
| `LocalAgentTask.tsx` | Keep viewed/retained foreground agents in AppState after completion |
| `AgentTool.tsx` | Call `completeAsyncAgent` for foreground sync agents on completion |

## Current Uncommitted TUI / Session Fix Batch

This batch closes the remaining TUI/session issues that were still open after the earlier Codex convergence pass.

Included work:

- `dist/cli.js` startup fixed on Node 22 by removing runtime `using` / `await using` syntax from the active TypeScript build path.
- transcript cleanup:
  - assistant/user wrapper boxes now drop fully null child trees instead of leaving blank rows
  - duplicate bash pre-execution text is suppressed on the Codex turn-item path
  - commentary text is visible again, but does not get mislabeled as a final answer
  - Read/Search collapsed rendering is kept on one path instead of falling back to plain text
- spinner / status line cleanup:
  - fake `1 token` fallback removed
  - restored aggregate usage can backfill current usage after session restore
  - `context window` now follows `~/.codex/config.toml` and Codex CLI semantics:
    - `model_context_window` is read directly
    - default effective window is `258400`
    - auto compact threshold follows Codex CLI style clamping and reads `model_auto_compact_token_limit`
- session restore:
  - `getLastSessionLog(...)` now restores from the latest visible main-thread leaf instead of being truncated by a later side branch message

Verification added in this batch:

- `upstream/claude-code/tests/toolTranscriptTuiAcceptance.test.mjs`
- `upstream/claude-code/tests/tokensRestore.test.ts`
- `upstream/claude-code/tests/sessionRestoreRegression.test.ts`
- `upstream/claude-code/tests/contextWindowAlignment.test.ts`
- `upstream/claude-code/tests/statusLineSource.test.mjs`

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
- `direct connect` / `ssh` 的远端权限取消残留修复已经落地到本地代码：`control_cancel_request` 不再在 direct connect manager 中被吞掉，direct/ssh hook 也都会在取消、断开、重连时清理本地权限弹窗队列。
- `VirtualMessageList` 的“中间消息重排但总数不变时旧 key 复用导致滚动错位”风险已按对象身份变化补了重建条件。
- `/sandbox` 的本地 fallback 现在会把真实缺失原因放进依赖检查结果里，并且 Linux / WSL / macOS 会走支持平台判定；当前真实 PTY 证据见 `artifacts/manual-tui-sandbox-2026-04-04.md`。
- 真实 Codex provider TUI 的开发型输入已再次确认能进入工作态；当前工件见 `artifacts/manual-tui-real-task-2026-04-04.md`。但这套 PTY 驱动对长任务中途工具流的抓取还不够稳定，仍需继续改进。
- 新一轮真实 PTY slash 命令清扫已留下工件 `artifacts/manual-tui-command-sweep-2026-04-04.md`：一方面确认 Claude / Anthropic 业务命令已从 Codex 模式移除，另一方面确认 `/plan`、`/model status`、`/theme`、`/copy` 仍能在真实 TUI 中工作。
- 第二轮真实 PTY slash 命令清扫工件已补到 `artifacts/manual-tui-command-sweep-round2-2026-04-04.md`：确认 `/help`、`/model`、`/effort`、`/memory`、`/status`、`/doctor`、`/mcp` 可用，`/statusline` 已移除；随后又在真实 PTY 中定位并修掉了 `/agents` 的空白回落问题，根因不是命令本身被改坏，而是 `src/components/agents/ToolSelector.tsx` 这一支在本地 JSX 动态加载时仍带着 `src/...` 绝对导入，运行时直接抛 `ERR_MODULE_NOT_FOUND`。
- `/agents` 当前的真实 PTY 验收已经补到更深一层：命令页能稳定显示 `No agents found` / `Create new agent` / built-in agents 列表，继续回车后还能进入 `Choose location`，显示 `Project (.claude/agents/)` 与 `Personal (~/.claude/agents/)` 两项。
- 新的真实长任务工件已补到 `artifacts/manual-tui-long-task-agents-2026-04-04.txt` 和 `artifacts/manual-tui-long-task-agents-after-permission-2026-04-04.txt`：当前可稳定看到真实 `Bash` 权限弹窗和后续继续搜索，但在采样窗口内尚未走到改文件与总结阶段。
- 新增工件 `artifacts/manual-tui-long-task-fuller-round3-2026-04-04.txt`：再次证明真实长任务会先说明“暂不编辑”，再给出更具体的一组只读检查命令，并进入权限确认界面；当前脚本已成功自动批准一次，但采样窗口内仍未走到最终 bug 定位总结。

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
- 远端 direct/ssh 两条链路还没有做完对应的真实 TUI / 真实远端会话验收；当前只完成了本地代码修复和主链 PTY 复查。
- `/sandbox` 当前已从误报/崩溃收口到可识别命令，但完整配置界面的端到端 PTY 留证还没补齐。
- 真实 Codex provider 长任务的中途工具流在当前 PTY harness 里仍然不够容易完整抓取；现有工件只能稳定证明“提交成功并进入工作态”。
- 保留下来的 slash 命令还没有按真实 PTY 全量逐条扫完；当前已新增补到 `/help`、`/model`、`/effort`、`/memory`、`/status`、`/doctor`、`/mcp`、`/permissions`、`/config`、`/files`、`/branch`，其中 `/agents` 已推进到“真实 PTY 可用，已进入创建向导第一步”，`/branch` 在空会话下会自然提示 `No conversation to branch`。

Next command set:

本轮已复验通过：

- 真实 PTY：继续逐条扫剩余保留 slash 命令，下一批优先补 `/clear`、`/compact`、`/review`、`/init` 的真实界面行为
- 真实 PTY：继续做 direct/ssh 远端链路，重点看“远端取消权限请求后本地弹窗是否消失”
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

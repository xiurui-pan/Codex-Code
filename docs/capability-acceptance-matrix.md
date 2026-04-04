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
| Core interaction | TUI basic prompt/response loop | done | `upstream/claude-code/tests/tuiSmoke.smoke.mjs` | 2026-04-03 复验通过：真实 TTY 启动、出现 prompt、一轮问答、正常退出 |
| Core interaction | 自然语言“读取当前目录并总结”会直接走工具链 | done | `timeout 80s env OPENAI_API_KEY=\"$CRS_OAI_KEY\" node dist/cli.js -p --verbose --output-format stream-json --include-partial-messages '请读取当前目录的所有文件，然后直接告诉我这个项目的结构和关键入口。不要先提问，不要解释过程。' </dev/null` | 2026-04-03 复验通过：先直接进入 `Bash` / `Agent` / `Read` 工具链，不再先车轱辘式反问；同时修掉了 subagent `sonnet/haiku` 映射和缺失 ripgrep 导致的主链失败 |
| Slash commands | Core local slash command set | done | `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs` | 2026-04-03 复验通过：既覆盖本地 slash 多状态链路，也覆盖本地 slash 后继续普通提问的真实 TUI 闭环 |
| Slash commands | `/agents` local TUI acceptance | done | `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs` | covers local acceptance and no provider traffic |
| Slash commands | `/plugin` local TUI acceptance | done | `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs` | covers local acceptance and no provider traffic |
| Slash commands | `/reload-plugins` local TUI acceptance | done | `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs` | covers local reload result and no provider traffic |
| Slash commands | `/ide` local TUI acceptance | done | `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs` | covers local acceptance and no provider traffic |
| Slash commands | `/files` and `/plan` local TUI acceptance | done | `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs` | covers minimal local feedback paths without provider traffic |
| Slash commands | plan mode minimal TUI chain | done | `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs` | fixed by `45949c3`; current evidence is enter plan mode then re-run `/plan` to read empty current-plan status |
| Slash commands | plan mode resume existing plan subcase | done | `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs` | 2026-04-03 已放开并通过：`/plan` 在 `--resume <jsonl>` 后可读取已存在计划内容 |
| Slash commands | `/init` real PTY with mock + real Codex provider | done | `upstream/claude-code/tests/tuiInit.test.mjs`, `upstream/claude-code/tests/tuiInitRealProvider.smoke.mjs`, `artifacts/manual-tui-init-2026-04-04.md` | 2026-04-04 双验证通过：mock provider 25s 完成，real provider 120s 内进入 AskUserQuestion 多阶段流程；8s 采样窗口不足不是 bug |
| Slash commands | Claude / Anthropic business commands are absent in Codex mode (`/mobile`, `/chrome`, `/usage`, `/install-github-app`, `/web-setup`, `/remote-control`) | done | `artifacts/manual-tui-command-sweep-2026-04-04.md` | 2026-04-04 真实 PTY transcript 已证明这些命令在 Codex 模式下统一表现为 `Unknown skill`，不再打开旧业务页面 |
| Slash commands | kept local commands still work after the business-command cleanup (`/plan`, `/model status`, `/theme`, `/copy`) | in-progress | `artifacts/manual-tui-command-sweep-2026-04-04.md` | 第一轮真实 PTY 已补到这四条；第二轮继续往下补 |
| Slash commands | kept local commands second sweep (`/help`, `/model`, `/effort`, `/memory`, `/status`, `/doctor`, `/mcp`, `/permissions`, `/config`, `/files`, `/branch`) | done | `artifacts/manual-tui-command-sweep-round2-2026-04-04.md` | 2026-04-04 真实 PTY transcript 已证明这些命令当前都能进入对应页面或返回符合语义的本地状态文本；其中 `/branch` 在空会话下返回 `No conversation to branch` |
| Slash commands | `/statusline` is no longer exposed in Codex mode | done | `artifacts/manual-tui-command-sweep-round2-2026-04-04.md`, `upstream/claude-code/src/commands.ts` | 先在真实 TUI 复现“会话不暴露 Agent 工具”的真问题，再将该命令从 Codex 模式命令面移除；当前真实 TUI 返回 `Unknown skill: statusline` |
| Slash commands | `/agents` local TUI acceptance | done | `artifacts/manual-tui-command-sweep-round2-2026-04-04.md` | 2026-04-04 真实 PTY 已证明 `/agents` 页面可稳定显示，继续回车会进入 `Create new agent -> Choose location`；空白回落根因是 `src/components/agents/ToolSelector.tsx` 动态加载时仍使用 `src/...` 导入，已改为相对路径 |
| TUI stability | interrupt 后 `/exit` 仍可正常退出 | done | `upstream/claude-code/tests/tuiKeyboardInputAcceptance.test.mjs` | fixed by `9afabd4`; new regression covers the post-interrupt `/exit` path |
| TUI stability | 多轮稳定性：round1 成功 + round2 中断 + `/exit` 退出 | done | `upstream/claude-code/tests/tuiMultiTurnStabilityAcceptance.test.mjs` | fixed by `b21ff65`; current evidence stops at interrupt then exit, not third-round auto coverage |
| TUI stability | `/help` Esc dismiss restores footer state | done | `upstream/claude-code/tests/helpDismissTuiAcceptance.test.mjs` | fixed by `fbc85e3` |
| TUI stability | auto-update fallback message when package URL is missing | done | `upstream/claude-code/tests/autoUpdaterMessages.test.ts` | fixed by `ca7b9d3` |
| TUI stability | narrow terminal mixed-language input keeps completion focus stable | done | `upstream/claude-code/tests/tuiDisplayInteractionAcceptance.test.mjs` | added by `b4cebc3`, stabilized by `c7d136c` |
| TUI stability | long output + transcript toggle returns focus for next submit | done | `upstream/claude-code/tests/tuiDisplayInteractionAcceptance.test.mjs` | added by `b4cebc3`, stabilized by `c7d136c` |
| TUI stability | real Codex provider long task complete loop (submit → tools → locate → summarize) | done | `upstream/claude-code/tests/tuiLongTaskCompleteLoop.smoke.mjs` | 2026-04-04 真实 Codex provider PTY 测试 27s 完成：模型收到任务后进入工具调用链，识别出 ToolSelector.tsx 导入路径问题并给出总结 |
| Provider chain | silent stream timeout gives explicit error (no silent hang) | done | `upstream/claude-code/tests/codexResponsesTimeoutProvider.test.mjs` | fixed by `c7e97ed` |
| Provider chain | request-stage timeout gives explicit error | done | `upstream/claude-code/tests/codexResponsesTimeoutProvider.test.mjs` | fixed by `bf0555e` |
| Provider chain | Codex-only provider selection wins over legacy provider flags | done | `upstream/claude-code/tests/providersBehavior.test.mjs` | first cut landed in `b87593a` |
| Provider chain | API preflight / request params no longer rely on old firstParty gate in Codex-only path | done | `upstream/claude-code/tests/providersBehavior.test.mjs` | second cut landed in `5a3b315`; verifies narrowed helper is used in the two API-layer modules |
| Provider chain | 联网搜索真实自然语言场景 | done | `timeout 140s env OPENAI_API_KEY=\"$CRS_OAI_KEY\" node dist/cli.js -p --verbose --output-format stream-json --include-partial-messages '请联网搜索 OpenAI Codex CLI 官方文档，并用中文给我三点总结。' </dev/null` | 2026-04-03 复验通过：正常对话已改为暴露 Codex 原生 `web_search`，不再先走本地 `WebSearch` 权限链；输出里可见 `正在联网搜索...` / `联网搜索已完成...` 进度，再返回最终总结 |
| Permissions | Tool permission request/decision flow | done | `upstream/claude-code/tests/tuiPermissionTranscriptAcceptance.test.mjs` | 2026-04-03 复验通过：Bash allow / deny / Esc 取消，以及 transcript 进出后的焦点恢复 |
| Permissions | Host permission request/decision flow | out-of-scope | `upstream/claude-code/src/utils/sandbox/sandbox-adapter.ts` | 当前阶段未包含 `@anthropic-ai/sandbox-runtime`；Codex-only 本地链路不启用该 Anthropic 沙箱运行时 |
| Permissions | direct/ssh remote permission cancel clears stale local prompts | in-progress | `upstream/claude-code/src/server/directConnectManager.ts`, `upstream/claude-code/src/hooks/useDirectConnect.ts`, `upstream/claude-code/src/hooks/useSSHSession.ts` | 2026-04-04 代码修复已落地；真实远端会话留证仍待补齐 |
| Memory | Session memory inject + compact/resume | done | `upstream/claude-code/tests/sessionMemoryContext.behavior.mjs` | 2026-04-03 复验通过：主查询注入、resume-like compact、cross-project compact、防递归回灌 |
| Memory | Auto memory injection | done | `upstream/claude-code/tests/autoMemoryAcceptance.test.mjs` | 2026-04-03 复验通过：默认注入、override、显式关闭三条主链路 |
| Context docs | CLAUDE.md / @import / @文件引用 enter the real request body | done | `upstream/claude-code/tests/claudeMdAcceptance.test.mjs` | `f35380d` fixed the Codex request-body path so file refs are no longer dropped |
| Headless | Headless capability matrix | done | `upstream/claude-code/tests/headlessAcceptanceMatrix.test.mjs`, `timeout 45s env OPENAI_API_KEY=\"$CRS_OAI_KEY\" node dist/cli.js -p 'Reply with exactly: ok' </dev/null` | 2026-04-03 当前代码已再次复验：先修掉 `runHeadlessStreaming` 作用域错误，再确认基础问答恢复；矩阵用例与最小真实 `-p` 闭环都通过 |
| Model controls | model + reasoning effort behavior | done | `upstream/claude-code/tests/modelEffortTuiAcceptance.test.mjs` | 2026-04-03 复验通过：切换确认、Esc 取消、`/effort` 状态一致 |
| Anthropic product | claude.ai auth/OAuth/Bridge/proactive | out-of-scope | `docs/roadmap.md` | excluded in Codex-only phase |
| Comparative track | co-claw-dex performance/effectiveness comparison | done | `docs/co-claw-dex-benchmark-plan.md`, `docs/examples/co-claw-dex-tasks.sample.json`, `docs/examples/co-claw-dex-native-tasks.sample.json`, `artifacts/baseline-codex-code-latest.json`, `artifacts/baseline-codex-code-latest-summary.md`, `artifacts/baseline-co-claw-dex-latest.json`, `artifacts/baseline-co-claw-dex-latest-summary.md`, `artifacts/co-claw-dex-vs-codex-code-comparison.md` | 2026-04-03 首个本地成对对照包已完成；当前采用两边各自可直接复跑的任务包：Codex Code 侧是真实链路验收包，`co-claw-dex` 侧是仓库内 P0 校验包 |
| Comparative track | Stage 6 baseline records per-task state and aggregate metrics | done | `scripts/benchmark-co-claw-dex-baseline.mjs`, `artifacts/baseline-codex-code-latest.json`, `artifacts/baseline-codex-code-latest-summary.md` | 最新快照：`baseline-1775191017783`（`gpt-5.1-codex-mini`，8 任务，`pass_rate = 1`，`timeout_rate = 0`，`latency_p50_ms = 56589`，`latency_p95_ms = 80769`） |

## Maintenance Rules

- Update this table whenever a related acceptance test is added or changed.
- Do not mark `done` without a command that others can rerun.
- Keep out-of-scope items visible to avoid hidden scope drift.

## Next Acceptance Commands

- 真实 PTY：`/init` 已在 2026-04-04 收口（mock + real provider 双验证通过）；`/clear`、`/compact`、`/review` 已在上一轮收口
- 真实 PTY：继续 direct/ssh 远端链路验收，重点观察“远端取消权限请求后本地弹窗是否立即清掉”
- `cd upstream/claude-code && node --test tests/tuiKeyboardInputAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/tuiMultiTurnStabilityAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/helpDismissTuiAcceptance.test.mjs tests/autoUpdaterMessages.test.ts tests/codexResponsesTimeoutProvider.test.mjs`
- `cd upstream/claude-code && node --test tests/tuiDisplayInteractionAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/claudeMdAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/providersBehavior.test.mjs`
- `cd upstream/claude-code && node --test --test-name-pattern "resume restores existing plan content" tests/coreSlashCommandsAcceptance.test.mjs`

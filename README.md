# Codex Code

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Codex Code is a **Codex-only local coding agent** built on the `claude-code` terminal infrastructure.
It keeps the practical terminal experience (TUI, tool execution, permission flow, compaction, session memory) while replacing the Anthropic API backend with an OpenAI Responses API / Codex provider.

## What This Project Is

- A focused migration from Claude Code into a Codex-native runtime.
- Not a multi-provider framework.
- Not a branding-only fork.
- Not a prompt-only adaptation.

## Why This Is Not "Just Prompt Changes"

Prompt edits can adjust behavior, but they cannot replace runtime responsibilities that decide whether a coding agent is reliable:

- turn item and execution object modeling
- tool call/result lifecycle
- permission request/decision records
- TUI and headless state transitions
- session memory and compact/resume boundaries
- token usage tracking and cost display
- agent/subagent output propagation

This project therefore changes both the model-facing protocol and the local execution path, not only text prompts.

## Architecture

```
User Input → TUI (React/Ink)
  → query.ts (main loop)
    → codexResponses.ts (SSE streaming, OpenAI Responses API)
      → codexTurnItems.ts (normalizes output to ModelTurnItem[])
        → modelTurnItems.ts (renders system messages in TUI)
      → codexResponsesUsage.ts (token/cost tracking)
    → query.ts (attaches usage to assistant messages)
  → Tool Execution (Bash, Read, Write, Edit, Glob, Grep, Agent, MCP, etc.)
  → Permission Flow
  → Compaction / Session Memory
```

Key files changed from upstream:

| File | Purpose |
|---|---|
| `src/services/api/codexResponses.ts` | SSE streaming adapter: synthetic thinking events, usage extraction, web search integration |
| `src/services/api/codexTurnItems.ts` | Converts Codex output items (function_call, function_call_output, web_search_call) to ModelTurnItem |
| `src/services/api/modelTurnItems.ts` | Renders tool status messages in TUI |
| `src/services/api/codexResponsesUsage.ts` | Converts OpenAI usage format to Anthropic format for cost tracking |
| `src/query.ts` | Main loop: usage attachment, context window % |
| `src/utils/currentPhase.ts` | `isCurrentPhaseCustomCodexProvider()` gate for Codex-specific behavior |

## Scope Status

### Done

- Codex-only provider selection (OpenAI Responses API via localhost)
- Synthetic thinking stream events (spinner shows "thought for Ns")
- Token usage tracking and context window percentage display
- `~/.codex/config.toml` context window alignment:
  - `model_context_window` is now read directly
  - default effective context window is aligned to Codex CLI (`258400`)
  - auto compact threshold follows Codex CLI semantics and reads `model_auto_compact_token_limit`
- Agent/subagent `function_call_output` propagation (main model reads agent results)
- Tool status messages localized to English
- Foreground agent transcript preservation after completion
- Web search via Codex native `web_search` tool
- All core slash commands verified in real PTY
- Permission flow and tool execution stable
- Session memory and compaction working
- headless `-p` mode working
- TUI/session restore cleanup:
  - transcript blank-row sources reduced
  - duplicate bash pre-execution text suppressed
  - commentary text restored without masquerading as final answer
  - Read/Search collapsed rendering stabilized
  - `-c` / `--resume` no longer restore only the latest suffix in the tested branch case
- co-claw-dex baseline comparison completed

### Out of Scope (Anthropic-only)

- claude.ai subscription / OAuth authentication
- Anthropic rate limit display (`getRawUtilization` returns `{}` for Codex)
- GrowthBook feature flags (Codex path bypasses)
- Anti-distillation and account-risk signal handling

### Still to Shrink

- Residual Claude/Anthropic naming in some user-facing strings
- Dead Anthropic-specific code branches not yet pruned

See `docs/roadmap.md` and `docs/progress.md` for precise status.

## Capability Acceptance

- Matrix doc: `docs/capability-acceptance-matrix.md`
- Checklist: `docs/codex-only-local-checklist.md`, `docs/tui-acceptance-checklist.md`

## Documentation

| Doc | Description |
|---|---|
| `docs/roadmap.md` | Phase plan and definition of done |
| `docs/progress.md` | Detailed progress log with evidence links |
| `docs/capability-acceptance-matrix.md` | Row-by-row capability tracking |
| `docs/source-baseline.md` | Upstream source baseline |
| `docs/co-claw-dex-benchmark-plan.md` | Comparative evaluation plan |

## Quick Start

Requirements:

- Node.js `>=22`
- pnpm `>=10`
- Codex provider config in `~/.codex/config.toml`

Install and build:

```bash
pnpm install
node scripts/build.mjs
```

Run:

```bash
CODEX_CODE_USE_CODEX_PROVIDER=1 \
CODEX_CODE_DISABLE_TERMINAL_TITLE=1 \
DISABLE_AUTOUPDATER=1 \
node dist/cli.js
```

Config example (`~/.codex/config.toml`):

```toml
model_provider = "crs"
model = "gpt-5.4"
model_context_window = 272000
# Optional; when omitted, Codex Code clamps auto compact to 90% of the
# configured/raw context window, matching Codex CLI semantics.
# model_auto_compact_token_limit = 244800
```

## License

This repository uses MIT for original repository content. See `LICENSE`.
Imported upstream snapshots and third-party material are not relicensed by root MIT. See `NOTICE` and `upstream/README.md`.

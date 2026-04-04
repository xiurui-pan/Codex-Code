# Manual TUI Command Sweep Round 2 (2026-04-04)

Context:
- repo: `upstream/claude-code`
- mode: real PTY-driven TUI sessions
- provider: actual Codex-backed runtime with `CLAUDE_CODE_USE_CODEX_PROVIDER=1`
- note: each run used a temporary `HOME` that only copied `~/.codex/config.toml`

## Verified working in real TUI

### `/help`
- opens the help surface in real TUI
- visible text includes `Codex Code v0.0.0-dev`, `For more help: https://developers.openai.com/codex/overview`, and `esc to cancel`

### `/model`
- opens the real model picker
- visible items include `Default (recommended)`, `gpt-5.4-mini`, `gpt-5.4`, `gpt-5.3-codex`, `gpt-5.2-codex`, `gpt-5.1-codex-mini`, `gpt-5.1-codex`, `gpt-5.1-codex-max`
- bottom line shows `High reasoning` and `Enter to confirm · Esc to exit`

### `/effort`
- returns current effort status in real TUI
- visible text includes `Current effort level: high (Stronger reasoning for harder tasks)`

### `/memory`
- opens the memory view in real TUI
- visible text includes `Learn more: https://developers.openai.com/codex/overview`
- visible items include `~/.claude/CLAUDE.md` and project memory entry

### `/status`
- opens the status page in real TUI
- visible text includes version, session id, cwd, proxy, model, and settings sources

### `/doctor`
- real TUI no longer crashes
- visible text includes diagnostics, current path, install method, search status, and update section

### `/mcp`
- real TUI returns the expected empty-state copy
- visible text includes `No MCP servers configured. Please run /doctor if this is unexpected.`

## Confirmed removed in Codex mode

### `/statusline`
- before removal, real TUI reproduced a true bug: the model said the session did not expose an `Agent` tool
- after command-surface cleanup, real TUI now returns `Unknown skill: statusline`
- this is preferable to leaving a broken Codex-visible command that still tries to edit `~/.claude` statusline settings

## Remaining issue found in real TUI

### `/agents`
- command is recognized and enters loading state
- but current real PTY transcript still falls back to the normal prompt without visible menu content or result text
- this remains an active bug candidate

## Real long-task follow-up

Prompt used:

```text
请修复 /agents 在 Codex 模式真实 TUI 中看起来空白回落的问题。先读相关实现定位原因，只改最小范围代码，然后运行最小验证命令确认，最后总结。
```

Observed behavior:
- task is accepted by the real TUI and enters working state
- the assistant requests real Bash permissions instead of fake chat-only reasoning
- first requested command is `pwd && rg --files .`
- after allowing it, the session continues and later requests more Bash searches
- a later permission prompt is still natural and specific, for example searching `/agents` references in `src`
- during the captured window it had not yet reached file edits or final summary

Artifacts:
- `artifacts/manual-tui-command-sweep-round2-2026-04-04.json`
- `artifacts/manual-tui-long-task-agents-2026-04-04.txt`
- `artifacts/manual-tui-long-task-agents-after-permission-2026-04-04.txt`

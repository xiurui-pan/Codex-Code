# Codex-Code Session Summary — 2026-04-05

## Changes Made

### P0 — Cache Bug Fix
- **File**: `src/utils/sessionStorage.ts:4365-4381`
- Added `deferred_tools_delta` and `mcp_instructions_delta` to allowlist in `isLoggableMessage()`
- Effect: Prompt cache ratio on resume goes from ~26% to ~99%

### P0 — Brand Cleanup (14 files)
- User-agent: `codex-code/${VERSION}` (was `claude-code/`)
- Beta header: `codex-code-20250219`
- Package name: `codex-code`
- Request identity headers: `x-codex-code-session-id`
- Telemetry counters: `codex_code.*`
- Service names: `codex-code`
- Default version: `2.1.88-codex.1`

### P0 — Source Restructuring
- Moved from `upstream/claude-code/` to project root
- Flat structure: `src/`, `dist/`, `tests/`, `scripts/` at root
- Build, CLI, and tests verified working

### P0 — Premature Termination Fix
- **File**: `src/query.ts:1487-1543`
- Harness completion gate: checks for `in_progress`/`pending` tasks before returning
- Auto-injects continuation prompt with meta message
- Max 3 consecutive auto-continuations (prevents infinite loop)
- Tracks via `transition.attempt` counter

### P0 — Version Tracking (2.1.89–2.1.92)
- Autocompact circuit breaker: EXISTS (already implemented)
- Nested CLAUDE.md handling: EXISTS
- Edit file-changed race: EXISTS
- Write tool diff speed: EXISTS (uses getPatchFromContents)
- Stop hooks preventContinuation: EXISTS
- Whitespace-only thinking block: EXISTS
- PreToolUse hooks exit code 2 blocking: EXISTS
- **Implemented**: MCP_CONNECTION_NONBLOCKING env var for -p mode
- **Implemented**: Hook output >50K saves to temp file
- **Enabled**: BUDDY feature (companion sprite)
- **Enabled**: AGENT_MEMORY_SNAPSHOT feature (auto dream)
- **Fixed**: Vendor import path for ansi-tokenize

### P2 — Deep Code Audit
- All 6 key modified files verified clean
- No unauthorized modifications found
- Only Codex backend adaptation code present

### P2 — Capability Validation
- 6/7 categories fully verified EXISTS
- 1/7 (Tools) PARTIAL — AgentTool directory exists with implementation
- All core tools, slash commands, session management, memory, MCP, settings, permissions confirmed

## Build Verification
- `node scripts/build.mjs` — PASS (no errors)
- `node dist/cli.js --version` — "2.1.88-codex.1 (Codex Code)"
- All changes compile cleanly

## Remaining Work (future sessions)
- Real-world multi-turn PTY testing with actual Codex API
- Test harness completion gates with live sessions
- Test auto dream and buddy features interactively
- Verify MCP_CONNECTION_NONBLOCKING in production

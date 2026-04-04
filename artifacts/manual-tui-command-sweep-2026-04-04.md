# Manual TUI Command Sweep (2026-04-04)

Context:
- repo: `upstream/claude-code`
- mode: real PTY-driven TUI sessions
- provider: actual Codex-backed startup using the copied `~/.codex/config.toml`
- note: for commands that mutate local settings, the session ran under a temporary `HOME` with only `.codex/config.toml` copied in, so the real user home was not modified

## 1. Business commands removed from Codex mode

What was checked in a live TUI session after the command filter change:
- `/mobile`
- `/chrome`
- `/usage`
- `/install-github-app`
- `/web-setup`
- `/remote-control`

Observed transcript excerpt:

```text
❯ /mobile
Unknown skill: mobile

❯ /chrome
Unknown skill: chrome

❯ /usage
Unknown skill: usage

❯ /install-github-app
Unknown skill: install-github-app

❯ /web-setup
Unknown skill: web-setup

❯ /remote-control
Unknown skill: remote-control
```

Conclusion:
- These Claude / Anthropic business commands are no longer live user-facing slash commands in Codex mode.
- This matches the current cleanup goal: keep the Claude Code shell and architecture, but remove Codex-incompatible business flows.

## 2. Kept command: `/plan`

Observed transcript excerpt:

```text
❯ /plan
Enabled plan mode

❯ /plan
Already in plan mode. No plan written yet.
```

Conclusion:
- The local `/plan` flow still works in a real TUI session.
- Re-entering `/plan` in the same session correctly reports the empty-plan status instead of falling through or crashing.

## 3. Kept command: `/model status`

Observed transcript excerpt:

```text
❯ /model status
Current model: gpt-5.4 · reasoning: medium
```

Conclusion:
- The model/status path is live in a real Codex-backed TUI session.
- The session reports the current model and reasoning level through the slash-command path.

## 4. Kept command: `/theme`

Observed transcript excerpt:

```text
❯ /theme
Theme
Choose the text style that looks best with your terminal
1. Dark mode
2. Light mode
3. Dark mode (colorblind-friendly)
4. Light mode (colorblind-friendly)
5. Dark mode (ANSI colors only)
6. Light mode (ANSI colors only)
Enter to select · Esc to cancel

❯ /theme
Theme set to dark
```

Conclusion:
- The theme picker still opens in a real TUI session and renders the selectable list.
- The command can complete a selection flow and return a success message.

## 5. Kept command: `/copy`

Observed transcript excerpt:

```text
❯ 请只回复 COPY_ME_ONLY，不要添加任何别的字符。
COPY_ME_ONLY

❯ /copy
Copied to clipboard (12 characters, 1 lines)
Also written to /tmp/claude/response.md
```

Conclusion:
- A real Codex-backed reply can be copied through the live `/copy` command path.
- The command still writes the response to both clipboard flow and `/tmp/claude/response.md`.

## Related artifacts
- `artifacts/manual-tui-sandbox-2026-04-04.md`
- `artifacts/manual-tui-real-task-2026-04-04.md`

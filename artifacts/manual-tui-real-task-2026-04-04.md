# Manual TUI Transcript - Real Task Submission (2026-04-04)

Context:
- repo: `upstream/claude-code`
- mode: real PTY-driven TUI session
- provider: actual Codex-backed runtime via `CLAUDE_CODE_USE_CODEX_PROVIDER=1` and the local OpenAI key environment

What was verified:
- The real TUI accepts a normal development-style prompt in the Codex-backed session.
- After submit, the UI leaves the idle prompt and enters working state instead of crashing or bouncing back with a fake local-only message.
- In this PTY harness, mid-turn tool streaming still is not captured well enough before manual interrupt, so this artifact proves submit-and-work-state, not full streamed transcript fidelity.

Observed transcript excerpt:

```text
读取 src/server/directConnectManager.ts 前 20 行，然后简短确认你已经读到文件内容。

ctrl+g to edit in Vim
```

Notes:
- Earlier in the same session family, a similar real task was accepted under `xhigh`; this run repeated the check after trying to lower effort.
- The harness still needs a better way to preserve mid-turn tool output before interrupting.

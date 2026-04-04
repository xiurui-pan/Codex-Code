# Manual TUI Transcript - /sandbox (2026-04-04)

Context:
- repo: `upstream/claude-code`
- mode: real PTY-driven TUI session
- provider: local dummy SSE server only to let the TUI boot; this check is for the local `/sandbox` path, not model output

What was verified:
- `/sandbox` no longer reports the false "only supported on macOS, Linux, and WSL2" message in this Linux environment.
- After enabling the Linux platform path for the runtime-missing fallback, the first real TUI run exposed a deeper crash caused by the fallback `checkDependencies()` returning a Promise.
- That async mismatch was fixed.
- After rebuild, the same real TUI path no longer crashed; the command is recognized and returns the local sandbox status line.

Observed transcript excerpt:

```text
/sandbox
/sandbox ⚠ sandbox disabled (⏎ to configure)
```

Notes:
- This confirms the user-facing path moved from false platform denial / crash into a normal local slash-command path.
- It does not yet prove the full interactive sandbox settings screen was exercised end-to-end.

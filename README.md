# Codex Code

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Codex Code is a Codex-first local coding agent for the terminal.
It keeps the native Claude Code feel where it matters most, then swaps the model runtime to Codex / OpenAI Responses.

Keep the terminal soul. Lose the account maze.

This project is for people who loved the local product experience, not the surrounding service stack.
The fast TUI, transcript-led workflow, slash commands, tool calling, permission checkpoints, session resume, compaction, plan mode, and agent collaboration stay.
Claude.ai login paths, Anthropic subscription plumbing, upgrade nudges, and other service-specific layers do not.

## Beta Status

This repository is ready for a source-installed beta.
The recommended path is:

- clone the repository
- install dependencies
- build once
- install the local `codex-code` launcher
- start the TUI with `codex-code`

Codex Code is not published as an npm package yet.
For this beta, the supported path is the local launcher script included in this repository.

## Why It Feels Native

Compared with the original Claude Code local experience, this project intentionally keeps the parts people actually use every day:

- the terminal harness and shell-first workflow
- the TUI layout, transcript view, status areas, and interaction rhythm
- slash commands, tool calling, permission prompts, and command execution flow
- session resume, compaction, local memory files, and plan mode behavior
- background task and agent interaction patterns

Under the hood, that also means we keep a lot of the original local execution logic instead of only copying the surface:

- the full-screen terminal loop: prompt input, transcript toggle, status lines, progress rows, and completion states
- the tool loop: tool call, permission check, execution, tool result capture, and transcript rendering
- the shell workflow: cwd-aware command flow, prompt-to-command rhythm, and local-first execution feel
- the session layer: saved conversations, resume, compaction, local memory files, and transcript navigation
- the planning and agent layer: plan mode, approval handoff, background tasks, subagents, task notifications, and follow-up messaging

## What We Remove On Purpose

Codex Code is deliberately lighter than the original service stack.
For the current Codex-first beta, the supported path removes or avoids:

- Claude.ai login and OAuth-dependent startup paths
- Anthropic subscription tiers, upgrade prompts, and account-heavy business surfaces
- Anthropic-only flows such as Bridge, assistant mode, and proactive cloud paths in the supported beta setup
- the need to wire local coding through first-party Anthropic account infrastructure

## What Powers It Now

What changes is the model execution path and the surrounding Codex-specific runtime:

- Codex / OpenAI Responses becomes the main model path
- Codex-facing configuration lives in `~/.codex/config.toml`
- the local launcher enables the Codex provider by default
- the local launcher disables auto-update by default for a steadier beta workflow

## Requirements

- Node.js `>=22`
- pnpm `>=10`
- a configured Codex provider in `~/.codex/config.toml`
- a Unix-like shell for the local launcher script

## Install

```bash
pnpm install
pnpm build
pnpm install:local
```

For repeated local setup, you can also use:

```bash
pnpm setup:local
```

By default, `pnpm install:local` writes a launcher to `~/.local/bin/codex-code`.
If `~/.local/bin` is not already on your `PATH`, add it once:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

After installation, verify that the command is available:

```bash
codex-code --help
```

If you want to install into a custom bin directory, use:

```bash
pnpm install:local --bin-dir /custom/bin
```

If you are reinstalling over an older local launcher, use:

```bash
pnpm install:local --force
```

## Configure Codex

Example `~/.codex/config.toml`:

```toml
model_provider = "openai"
model = "gpt-5.4"
model_reasoning_effort = "high"
response_storage = false

[model_providers.openai]
base_url = "https://api.openai.com/v1"
env_key = "OPENAI_API_KEY"
```

Then export your API key before starting:

```bash
export OPENAI_API_KEY="your-api-key"
```

## Run

Start the TUI directly from the installed command:

```bash
codex-code
```

Useful commands:

```bash
codex-code --help
codex-code --version
codex-code -p "Summarize this repository"
```

## Troubleshooting

- `codex-code: command not found`
  - `pnpm install:local` installs the launcher to `~/.local/bin/codex-code` by default.
  - Make sure `~/.local/bin` is on your `PATH`, then restart your shell or run `source ~/.zshrc`.
- `node dist/cli.js` or `codex-code` fails after a local rebuild
  - Re-run `pnpm build` first, then retry.
  - If you replaced an existing launcher, also re-run `pnpm install:local --force`.
- You want to verify the local launcher is wired correctly
  - Run `codex-code --version` and `codex-code --help`.

## Build And Test

```bash
pnpm build
pnpm test
```

## Beta Notes

- this beta is source-installed, not npm-published
- the supported beta entrypoint is the local `codex-code` launcher
- the launcher keeps `CODEX_CODE_USE_CODEX_PROVIDER=1` and `DISABLE_AUTOUPDATER=1` by default

## License

This repository uses MIT for original repository content. See `LICENSE`.
Imported upstream snapshots and third-party material are not relicensed by the root MIT file. See `NOTICE` and `upstream/README.md`.

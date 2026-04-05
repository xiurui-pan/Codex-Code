# Codex Code

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Codex Code is a local coding agent for the terminal, built to preserve as much of the original Claude Code experience as possible while switching the model path to Codex / OpenAI Responses.

The goal is simple: keep the proven local experience, replace the model runtime.
That means the terminal harness, TUI structure, transcript view, tool invocation flow, permission loop, session resume, compaction, plan mode, and agent workflow stay familiar instead of being reinvented.

## Beta Status

This repository is ready for a source-installed beta.
The recommended beta path is:

- clone the repository
- install dependencies
- build once
- install the local `codex-code` launcher
- start the TUI with `codex-code`

Codex Code is not published as an npm package yet.
For this beta, the supported install path is the local launcher script included in this repository.

## What We Preserve

Compared with the original Claude Code local product experience, this project intentionally keeps:

- the terminal harness and local shell-oriented workflow
- the TUI layout, transcript mode, status areas, and interaction rhythm
- tool calling, permission confirmation, and command execution flow
- session resume, compaction, local memory files, and plan mode behavior
- background task and agent interaction patterns

## What Changes

What changes is the model execution path and the surrounding Codex-specific runtime pieces:

- Codex / OpenAI Responses becomes the main model path
- Codex-facing configuration lives in `~/.codex/config.toml`
- the local launcher enables the Codex provider by default
- the local launcher disables auto-update by default for a more stable beta workflow

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

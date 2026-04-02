# Codex Code

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Codex Code is a Codex-first coding agent project built from a direct `claude-code` source baseline.
It keeps the parts that already work well in the terminal, then rebuilds the model-facing runtime around Codex instead of around Claude-specific assumptions.

This project is not a generic multi-model framework, and it is not a simple API swap.
The direction is intentionally narrow: keep the strong local product experience, remove provider-shaped baggage, and make the main path feel native to Codex.

## Overview

Codex Code starts from a practical belief: Claude Code already proves that a local coding agent can feel fast, trustworthy, and pleasant in the terminal.
The TUI, main loop, tool execution, permission flow, and result handoff are worth keeping.

What does need to change is the internal runtime shape.
A Codex-based agent should not have to pretend to be Claude just to reuse a good product shell.
Codex Code therefore keeps the local experience, while steadily replacing Claude- and Anthropic-shaped internal layers with Codex-oriented turn items, execution objects, and model capabilities.

## Background

This repository exists because there is a clear gap between two strengths:

- `claude-code` offers a strong local terminal product experience
- Codex is better served by a cleaner model layer and execution model

Many forks stop at the provider boundary and translate requests just enough to make the CLI run.
That is useful, but it is not the end state of this project.
Codex Code takes the harder path: preserve the proven terminal experience, then gradually remove the compatibility layers that keep the runtime tied to Claude-specific shapes.

## Goals

The current goals are straightforward:

- keep the proven local interaction loop: TUI, main loop, tool execution, permissions, result handoff, and local shell support
- move the core runtime toward Codex-native turn items, execution objects, and model capabilities
- keep the project `Codex-only` for now, instead of stretching it into a broad compatibility layer
- turn validation into a standing discipline, not a one-off demo

Just as important are the current non-goals:

- this is not a broad multi-provider abstraction project
- this is not a surface-level branding change
- this is not a prompt-only adaptation
- Anthropic-specific product paths are outside the current main line

## What Is Already Working

The repository is already beyond an early prototype.
The current work has been validated in the real `upstream/claude-code` tree, not only in a mock sample.

Today, the project already has:

- a custom Codex provider wired into the real CLI path
- quick non-interactive validation working end to end
- interactive TUI basic Q&A running in the real terminal flow
- headless and structured tool calls working through the main path
- a real permission loop working with `--permission-prompt-tool stdio`
- both permission branches verified: allow and deny
- the first Codex turn-item and execution-item layers landed in the API path
- model and reasoning effort selection aligned across CLI, TUI-facing flow, config-facing options, and headless metadata

In short, this is already a live migration effort with working main-path behavior, not only a design note.

## What Comes Next

The next stage is about making the Codex path deeper, cleaner, and easier to trust.

Near term:

- let more upper layers consume Codex execution objects directly
- remove more Claude- and Anthropic-shaped compatibility shims from the main path
- keep the TUI, headless flow, and permission loop stable while those changes land

After that:

- systematically rename remaining product text from `Claude Code` to `Codex Code`
- make in-app model switching a formal TUI acceptance line, including model choice, reasoning effort, confirm, cancel, and visible state updates
- validate non-Anthropic-specific capabilities one by one against the official Claude Code capability list
- compare the project with `co-claw-dex` on performance and overall effectiveness, not only on feature parity

That acceptance line matters.
The long-term goal is not merely to say that Codex Code can start, answer, and call tools.
The goal is to prove that it can grow into a polished local coding agent with a clear Codex-native core.

## Repository Layout

- `docs/` - roadmap, progress log, analysis, references, and acceptance notes
- `packages/codex-code-proto/` - a small prototype for provider and request-shape validation
- `upstream/claude-code/` - imported upstream snapshot and active adaptation workspace
- `upstream/README.md` - source provenance and snapshot notes
- `README.zh-CN.md` - Simplified Chinese introduction
- `README.ja.md` - Japanese introduction
- `LICENSE` - open source license for original repository content
- `NOTICE` - scope note for original content and imported upstream material

## Quick Start

Requirements:

- Node.js `>=22`
- pnpm `>=10`
- a configured custom Codex provider, usually from `~/.codex/config.toml`

Current default values used in documentation and validation examples:

- model: `gpt-5.1-codex-mini`
- reasoning effort: `medium`

Install dependencies:

```bash
pnpm install
```

Run the prototype checks:

```bash
node packages/codex-code-proto/src/main.js --print-config
node packages/codex-code-proto/src/main.js 'Reply with CODEX_CODE_SMOKE_OK only'
node --test packages/codex-code-proto/test/*.test.js
```

Run the workspace quick verification:

```bash
pnpm smoke
```

Build the real CLI and verify the entry points:

```bash
pnpm -C upstream/claude-code build
node upstream/claude-code/dist/cli.js --version
node upstream/claude-code/dist/cli.js --help
```

## Why It Is Worth Watching

Codex Code is worth following if you care about coding agents that feel serious in the terminal.

- It reuses a proven local interaction experience instead of rebuilding everything from scratch.
- It chooses a clear direction instead of becoming a vague multi-model wrapper.
- It is moving the runtime inward, not stopping at a provider adapter.
- It keeps written evidence of progress through roadmap, progress notes, and acceptance material.
- It is trying to earn trust the hard way: by making the real path work, then validating it feature by feature.

If that direction matches what you want from a local coding agent, a star helps more people find the project and helps signal that this path is worth continuing.

## License

This repository uses the MIT License for original repository content. See `LICENSE`.

Imported upstream snapshots and other third-party material are not relicensed by the root `LICENSE`.
Please see `NOTICE` and `upstream/README.md` for the scope details.

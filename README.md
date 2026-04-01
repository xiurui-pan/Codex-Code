# Codex Code

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Codex Code is a Codex-first coding agent built from a direct `claude-code` source baseline.

The idea is simple:

- keep the parts Claude Code already does well in the terminal
- remove the model-layer assumptions that were built around Claude/Anthropic
- make the runtime fit Codex instead of forcing Codex to pretend to be Claude

This is not a generic multi-model framework, and not just an API swap.

## Why This Repo Exists

Claude Code has a strong local harness: TUI, main loop, tool execution, permission prompts, and result handoff.

Codex is better served by a different internal model layer: cleaner execution objects, clearer tool calls, and less provider-shaped glue.

Codex Code tries to combine those strengths:

- Claude Code-style local product experience
- Codex-oriented execution and turn modeling
- a narrower, simpler `Codex-only` direction

## What Is Working Today

Already validated in the real `upstream/claude-code` tree:

- Codex-backed local CLI startup
- non-interactive smoke path
- interactive TUI basic Q&A
- real tool calls in the headless / structured path
- real permission loop with `--permission-prompt-tool stdio`
- allow / deny permission branches
- first pass of Codex turn items and execution items in `src/services/api`

## Current Focus

Done:

- source baseline imported and documented
- custom Codex provider wired into the real CLI path
- non-interactive and basic TUI paths verified
- minimum tool / permission loop closed
- first turn-item layer landed
- first execution-item layer landed

Next:

- let upper layers consume Codex execution objects directly
- remove more Claude / Anthropic compatibility shims from the main path
- keep the TUI, headless, and permission loop stable while that cleanup happens

Later:

- systematic rename from `Claude Code` to `Codex Code` across product text and naming
- capability-by-capability acceptance against the official Claude Code docs, excluding Anthropic-specific features

## Repository Layout

- `docs/` - roadmap, progress log, analysis, and references
- `packages/codex-code-proto/` - small provider / request-shape validation prototype
- `upstream/claude-code/` - imported upstream snapshot and active adaptation workspace
- `upstream/README.md` - provenance and snapshot notes
- `LICENSE` - default license for original repository content
- `NOTICE` - license scope note for original content vs upstream snapshots

## Key Documents

- `docs/analysis.md` - what should be reused, what should be replaced, and why prompt-only fixes are not enough
- `docs/roadmap.md` - staged plan, milestones, and current priorities
- `docs/progress.md` - rolling implementation log
- `docs/source-baseline.md` - baseline entry points and coupling map
- `docs/claude-code-vs-codex-cli.md` - side-by-side product and architecture comparison

## Quick Start

Requirements:

- Node.js `>=22`
- pnpm `>=10`
- a configured custom Codex provider, usually from `~/.codex/config.toml`

Current default for validation and interactive checks:

- model: `gpt-5.1-codex-mini`
- reasoning effort: `medium`

Install dependencies:

```bash
pnpm install
```

Prototype checks:

```bash
node packages/codex-code-proto/src/main.js --print-config
node packages/codex-code-proto/src/main.js 'Reply with CODEX_CODE_SMOKE_OK only'
node --test packages/codex-code-proto/test/*.test.js
```

Workspace smoke:

```bash
pnpm smoke
```

Real CLI build and basic verification:

```bash
pnpm -C upstream/claude-code build
node upstream/claude-code/dist/cli.js --version
node upstream/claude-code/dist/cli.js --help
```

## Status

Codex Code is already past the sample stage and into real main-path refactoring.
It is usable for focused validation, but it is not feature-complete yet.

## License

Original content in this repository is released under the MIT License. See `LICENSE`.

Important scope note:

- the root license applies to original repository content unless noted otherwise
- imported upstream snapshots, including `upstream/claude-code/`, are **not** relicensed by the root `LICENSE`
- third-party and upstream material stay under their own original terms
- see `NOTICE` and `upstream/README.md` for scope details

# Codex Code

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Codex Code is a **Codex-only local coding client**.
It keeps the practical terminal experience from the `claude-code` baseline, while removing Anthropic/Claude-specific product coupling from the main path.

## What This Project Is

- A focused migration from `upstream/claude-code` into a Codex-native runtime.
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

This project therefore changes both the model-facing protocol and the local execution path, not only text prompts.

## Scope Status (Anthropic/Account-Risk Logic)

Mainline direction is explicit: Codex-only, custom Codex provider, local execution first.

Already removed or taken out of mainline scope:

- Anthropic-first product assumptions in default runtime design
- claude.ai subscription-only capability assumptions
- anti-distillation and account-risk signal handling as migration targets
- GrowthBook/Anthropic product rollout logic as required dependency for Codex path

Still to remove or continue shrinking:

- remaining Claude/Anthropic naming and user-facing copy in imported surfaces
- residual compatibility shims that still emulate Claude-shaped events/objects
- dead or near-dead Anthropic-specific branches that are not needed by Codex-only acceptance

See `docs/roadmap.md` and `docs/progress.md` for precise status.

## Capability Acceptance Matrix

Codex Code now tracks capability acceptance as a first-class workstream:

- Matrix doc: `docs/capability-acceptance-matrix.md`
- Requirement: validate against the official Claude Code capability list item by item (excluding Anthropic-only product capabilities)
- Existing acceptance materials: `docs/codex-only-local-checklist.md`, `docs/tui-acceptance-checklist.md`

## Roadmap and Progress

- Roadmap: `docs/roadmap.md`
- Progress log: `docs/progress.md`
- Source baseline and references: `docs/source-baseline.md`, `docs/references.md`
- co-claw-dex baseline plan: `docs/co-claw-dex-benchmark-plan.md`
- co-claw-dex baseline sample: `docs/co-claw-dex-baseline-sample.md`

## Long-Term Comparison Target

Beyond feature parity, we will run **performance and effectiveness comparison** against `co-claw-dex`:

- response latency and stability
- tool success/retry profile
- end-to-end task completion quality
- migration complexity and maintenance cost

## Quick Start

Requirements:

- Node.js `>=22`
- pnpm `>=10`
- custom Codex provider config (usually in `~/.codex/config.toml`)

Install:

```bash
pnpm install
```

Build the upstream workspace:

```bash
pnpm -C upstream/claude-code build
```

## License

This repository uses MIT for original repository content. See `LICENSE`.
Imported upstream snapshots and third-party material are not relicensed by root MIT. See `NOTICE` and `upstream/README.md`.

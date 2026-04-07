# CLAUDE.md

This file provides guidance to Codex Code (localhost:3000/code) when working with code in this repository.

## Commands

- Install and set up local launchers:
  - `pnpm install`
  - `pnpm build`
  - `pnpm install:local`
- Repeat local setup in one command: `pnpm setup:local`
- Build the CLI bundle: `pnpm build`
- Type-check the repo: `pnpm check`
- Run the main test suite: `pnpm test`
- Run a single root test file with the same harness as `pnpm test`:
  - `NODE_ENV=test node --import tsx --loader ./dist/loader.mjs --test tests/<name>.test.ts`
  - Swap in `*.test.mjs`, `*.smoke.mjs`, or `*.behavior.mjs` as needed.
- Run the built CLI directly without installing launchers:
  - `pnpm start`
  - `pnpm start:help`
  - `pnpm start:version`
- Verify local launcher installation: `codex-code --help`, `ccx --help`
- Install launchers into a custom bin dir: `pnpm install:local --bin-dir /custom/bin`
- Reinstall over an existing launcher: `pnpm install:local --force`
- Prototype workspace commands live under `packages/codex-code-proto/`:
  - `node --test`
  - `node src/main.js`

There is no root `lint` script in `package.json`; use the existing `pnpm check` and test suite instead of assuming `pnpm lint` exists.

## Primary Sources Of Truth

- `README.md` and this root `CLAUDE.md` are the repo-local guidance files; there is no `.cursorrules`, no `.cursor/rules/`, and no `.github/copilot-instructions.md`.
- `package.json` defines the shipped CLI package (`codex-code`) and the canonical root scripts.
- `scripts/build.mjs` and `scripts/install-local.mjs` are part of the product surface, not just tooling glue.

## Architecture

- The root package is the real product. `pnpm-workspace.yaml` includes `packages/*`, but `packages/codex-code-proto/` is an auxiliary prototype package, not the main runtime.
- Startup is intentionally layered:
  - `src/entrypoints/cli.tsx` is the thin bootstrap. It handles fast paths like `--version`, loads Codex config, applies early environment guards, and routes special modes before importing the full app.
  - `src/main.tsx` is the heavy orchestrator. It wires together interactive TUI mode, non-interactive/query flows, sessions, tool execution, MCP/bootstrap APIs, permissions, remote-managed settings, team context, and worktree support.
- The codebase is organized by subsystem instead of by package:
  - `src/entrypoints/` for startup modes
  - `src/services/` for product subsystems
  - `src/tools/` for model-callable tools
  - `src/cli/`, `src/context/`, and adjacent UI/state files for terminal interaction flow
  - `src/utils/` for shared runtime helpers
- Tooling is a first-class part of the app architecture. `src/tools/` contains the concrete tool implementations exposed to the model, and `src/entrypoints/mcp.ts` re-exposes the tool surface through an MCP server.
- `src/query.ts` is part of the non-interactive/model loop path and connects messaging, compaction, tool-use summaries, attachments, and queue management.

## Build And Distribution

- The build is custom. `pnpm build` runs `node scripts/build.mjs`, not a plain TypeScript compile.
- `scripts/build.mjs` uses a staged build rooted at `src/entrypoints/cli.tsx`, emits `dist/loader.mjs`, and hard-disables a large set of internal-only features/import paths for this external build.
- Local execution depends on built artifacts in `dist/`. `scripts/install-local.mjs` refuses to install launchers until `dist/cli.js` exists.
- Installed `codex-code` and `ccx` launchers default `CODEX_CODE_USE_CODEX_PROVIDER=1` and `DISABLE_AUTOUPDATER=1`.
- The repository is source-installed, not npm-published. Prefer the local launchers or `node dist/cli.js` flows documented in `README.md`.

## Tests

- The root suite is behavior-heavy and product-level, not just unit tests. Expect coverage around sessions, slash commands, permissions, memory, plan mode, MCP/tool behavior, and TUI acceptance flows.
- The root `pnpm test` script runs Node's built-in test runner with `tsx` and the built loader across:
  - `tests/*.test.ts`
  - `tests/*.test.mjs`
  - `tests/*.smoke.mjs`
  - `tests/*.behavior.mjs`
- When debugging a feature, trace from `src/entrypoints/cli.tsx` -> `src/main.tsx` -> the relevant `src/services/` or `src/tools/` module, then confirm behavior in `tests/`.

## Practical Notes

- If a rebuilt launcher behaves strangely, rebuild first with `pnpm build`; if you replaced an existing launcher, also rerun `pnpm install:local --force`.
- `~/.local/bin` is the default launcher install location; if the commands are missing, check `PATH` before assuming the install failed.
- Treat `packages/codex-code-proto/` as a reference or experiment area for Codex-response shaping, not as the main place to implement product behavior unless the task is explicitly about that prototype.

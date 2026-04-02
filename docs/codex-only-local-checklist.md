# Codex-only 本地验收清单

这份清单只对照官方 Claude Code 文档里当前能在本地仓库验证、且不依赖 Anthropic 专属服务的能力。目标不是一次写全，而是给后续补验一个统一落点。

## 已完成本地验收

| 能力 | 当前结论 | 本地证据 |
| --- | --- | --- |
| 真实 TTY 下的最小 TUI 主链：启动、出现 prompt、完成一轮真实问答、正常退出 | 已验 | `upstream/claude-code/tests/tuiSmoke.smoke.mjs` |
| Headless `-p` 主链 | 已验 | `upstream/claude-code/tests/headlessStreaming.smoke.mjs` |
| Headless `--output-format stream-json` | 已验 | `upstream/claude-code/tests/headlessStreaming.smoke.mjs` |
| Codex 请求里的 reasoning effort 下发 | 已验 | `upstream/claude-code/tests/headlessStreaming.smoke.mjs`、`upstream/claude-code/src/main.tsx` |

## 已有本地入口，适合下一步补验

| 能力 | 当前状态 | 代码入口 |
| --- | --- | --- |
| `--output-format text` / `json` | CLI 已接入，缺独立 smoke | `upstream/claude-code/src/main.tsx` |
| `--continue` / `--resume` | CLI 已接入，已有相关行为测试，缺单独验收清单项 | `upstream/claude-code/src/main.tsx`、`upstream/claude-code/tests/sessionMemoryContext.behavior.mjs` |
| `--from-pr` | CLI 已接入，未单独做 Codex-only 本地验收 | `upstream/claude-code/src/main.tsx` |
| Git worktrees | 主链与工具入口都在，未补独立 smoke | `upstream/claude-code/src/setup.ts`、`upstream/claude-code/README.md` |
| 文件/图片输入 | 工具与 CLI 入口都在，未补独立 smoke | `upstream/claude-code/src/tools.ts`、`upstream/claude-code/src/main.tsx`、`upstream/claude-code/README.md` |
| `CLAUDE.md` / `/memory` / `@import` | 本地代码入口存在，但这轮不把 session memory 当验收范围 | `upstream/claude-code/src/projectOnboardingState.ts`、`upstream/claude-code/src/commands/memory` |

## 暂不纳入当前清单

- `claude.ai` 登录、OAuth、Bridge、assistant mode、proactive 这类 Anthropic 专属能力。
- 任何依赖云端产品态、账号态或远端基础设施的验收项。

## 推荐补验顺序

1. `--output-format text/json` 的最小 headless 对照。
2. `--resume` / `--continue` 的单独本地验收条目。
3. worktree、文件/图片输入这两类高频本地能力。

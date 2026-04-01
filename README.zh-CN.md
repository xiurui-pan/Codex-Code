# Codex Code

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

`Codex Code` 是一个面向 Codex 的编码代理项目，直接以 `claude-code` 源码为基线，目标是在保留其本地终端体验的同时，把模型侧与执行对象层改造成更适合 Codex 的结构。

## 项目简介

这个项目不是通用多模型框架，也不是简单换一个接口地址。
当前方向已经明确收窄为 `Codex-only`。

当前重点是两件事：

- 保留已经被验证有效的本地 harness：TUI、主循环、工具执行、权限确认、结果回灌、本地 shell
- 逐步下线 Claude / Anthropic 专属的中间表示与兼容层，把内部结构改成更适合 Codex 的回合条目和执行对象

## 当前状态

已完成的关键能力包括：

- 自定义 Codex provider 已接入真实 CLI 主链
- 非交互 smoke 已验证
- 交互式 TUI 基础问答已验证
- headless / structured 工具闭环已验证
- `--permission-prompt-tool stdio` 权限允许 / 拒绝两条分支已验证
- 已落下第一版 Codex turn items 与 execution items

当前仍在进行中的重点：

- 让上层开始直接消费新的 Codex 执行对象
- 继续下线残留的 Claude / Anthropic 兼容投影
- 稳定 TUI、headless、权限闭环在 Codex-only 条件下的主链行为

## 仓库结构

- `README.md`：英文主 README
- `README.zh-CN.md`：中文说明
- `README.ja.md`：日文说明
- `docs/`：路线图、进展记录、分析与参考资料
- `packages/codex-code-proto/`：provider / 请求形状验证样本
- `upstream/claude-code/`：上游源码快照与当前改造工作目录
- `upstream/README.md`：上游来源和快照维护说明
- `LICENSE`：本仓库原创内容默认许可证
- `NOTICE`：原创内容与上游快照的许可范围说明

## 文档导航

- `docs/analysis.md`
- `docs/roadmap.md`
- `docs/progress.md`
- `docs/source-baseline.md`
- `docs/claude-code-vs-codex-cli.md`
- `docs/references.md`

## 快速开始 / 验证命令

当前文档中的验证与交互默认模型选择：

- model：`gpt-5.1-codex-mini`
- reasoning effort：`medium`

```bash
pnpm install
pnpm smoke
pnpm -C upstream/claude-code build
node upstream/claude-code/dist/cli.js --version
node upstream/claude-code/dist/cli.js --help
```

原型验证命令：

```bash
node packages/codex-code-proto/src/main.js --print-config
node packages/codex-code-proto/src/main.js '只回复 CODEX_CODE_SMOKE_OK'
node --test packages/codex-code-proto/test/*.test.js
```

## 计划概览

已完成：

- 固定源码基线与文档基线
- 打通 Codex provider 最小闭环
- 打通本地 CLI / 非交互 / 基础 TUI 问答
- 打通真实工具与权限最小闭环
- 落下第一版统一条目层与执行对象层

待完成：

- 让上层真正直接消费 Codex 执行对象
- 继续下线旧的 Claude / Anthropic 残留入口
- 后续系统性把产品名、UI 文案与残留 `Claude Code` 命名改成 `Codex Code`
- 后续对照 Claude Code 官方能力表，逐项验收非 Anthropic 特化能力

## 许可证说明

本仓库默认对原创内容采用 MIT License，见 `LICENSE`。

但需要特别注意：

- 该许可证只适用于本仓库原创内容，除非文件另有说明
- `upstream/claude-code/` 等导入的上游或第三方内容，不因本仓库的 `LICENSE` 自动改为 MIT
- 上游快照仍按其各自原始许可证或条款处理
- 详细范围说明见 `NOTICE` 与 `upstream/README.md`

# Codex Code

`Codex Code` 用来把 `claude-code` 的终端产品能力和 `codex` 的模型适配方式结合起来，做出一个更适合 Codex 模型的编码代理。

当前仓库先做两件事：

1. 固定 `claude-code` 的源码基线和迁移判断。
2. 把后续开发需要长期维护的文档和上游快照放稳。

## 当前判断

这项改造的重点不是把 Anthropic 的消息协议替换成 OpenAI 的响应协议，而是把 Claude Code 里围绕 Claude 行为写死的执行外壳，改造成更适合 Codex 的内部结构。

直接结论：

- `Claude Code` 目前在很多关键使用感上确实比 `Codex CLI` 更好用，而且原因不只是界面。
- `Codex CLI` 目前在模型能力建模、结构化工具、权限参数化、阶段化输出这些底层设计上更适合 Codex。
- `Codex Code` 的目标不是在两者之间二选一，而是把 Claude Code 的产品外壳和 Codex 的模型适配方式接起来。

## 仓库结构

- [`docs/`](./docs)
  正式分析文档、路线图、参考说明。
- [`upstream/claude-code/`](./upstream/claude-code)
  从本地 `claude-code` 仓库导入的源码快照，用作后续改造基线。
- [`upstream/README.md`](./upstream/README.md)
  上游来源、提交号、导入边界和维护规则。

## 文档索引

- [`docs/source-baseline.md`](./docs/source-baseline.md)
  `claude-code` 的关键入口、强耦合点和当前基线。
- [`docs/analysis.md`](./docs/analysis.md)
  Claude Code 与 Codex 的结构差异，以及真正要改造的地方。
- [`docs/roadmap.md`](./docs/roadmap.md)
  分阶段实施路线，当前优先级和第一里程碑验收标准。
- [`docs/claude-code-vs-codex-cli.md`](./docs/claude-code-vs-codex-cli.md)
  明确回答“为什么 Claude Code 比 Codex CLI 更好用，不只是界面”。
- [`docs/references.md`](./docs/references.md)
  证据分级、官方资料和第三方辅助参考。

## 当前基线

- `claude-code` 源码提交：`936e6c8e8d7258dd1b2bc127d704f02cc23076d5`
- `codex` 参考提交：`4c72e62d0bf345a57749cfd867951be1a49162b6`
- 文档初始化日期：`2026-03-31`

## 第一阶段目标

第一阶段只做 `Codex` 单模型，并先打通本地单会话编码闭环：

- 读代码
- 调本地命令
- 请求权限
- 生成修改建议
- 输出最终结果

这一步优先保留 Claude Code 的命令行交互、工具使用面、权限体验和主要工作流，再逐步把底层模型层和回合结构改造掉。

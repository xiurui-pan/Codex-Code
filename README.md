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
- [`packages/codex-code-proto/`](./packages/codex-code-proto)
  协议与 provider 验证样本。当前只用于验证 `~/.codex/config.toml`、Responses 请求形状和最小中间层表达，不是主开发线。
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

第一阶段只做 `Codex` 单模型，并先在 [`upstream/claude-code/`](./upstream/claude-code) 的真实主链路上抽两层：

- 模型接入层
- 回合中间层

这一步优先保留 Claude Code 现有的命令行交互、工具使用面、权限体验和主要工作流，再逐步替换底层模型接入与回合结构。

## 实验命令

- `node packages/codex-code-proto/src/main.js --print-config`
  读取 `~/.codex/config.toml`，显示当前 smoke 测试实际使用的 provider、model 和 reasoning。
- `node packages/codex-code-proto/src/main.js '只回复 CODEX_CODE_SMOKE_OK'`
  走真实 Responses provider，固定 `gpt-5.4` + `medium`，输出中间层对象。
- `node --test packages/codex-code-proto/test/*.test.js`
  运行当前原型的配置、请求体和标准化单元测试。

这些命令只用于验证 Codex provider 和 Responses 形状，不代表正式架构方向。

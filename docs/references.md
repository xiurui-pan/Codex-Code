# 参考与证据分级

## 一级依据

### 1. 本仓库导入的 Claude Code 源码快照

- 路径：`upstream/claude-code/`
- 来源提交：`936e6c8e8d7258dd1b2bc127d704f02cc23076d5`

这是判断 Claude Code 内部结构、主循环、工具层、权限链路、远端会话和界面耦合关系的最高优先级依据。

### 2. 本地 Codex 源码仓库

- 路径：`/home/pxr/workspace/CodingAgent/codex`
- 参考提交：`4c72e62d0bf345a57749cfd867951be1a49162b6`

这是判断 Codex 如何定义模型能力、工具协议、权限参数、子代理协作和输出阶段的最高优先级依据。

### 3. 官方公开资料

用于固定公开产品事实、发布时间和外部接口能力：

- OpenAI Codex 产品页
  - <https://openai.com/index/introducing-codex/>
- OpenAI Responses 接口
  - <https://platform.openai.com/docs/api-reference/responses/create>
- OpenAI Shell 工具说明
  - <https://platform.openai.com/docs/guides/tools-shell>
- OpenAI 弃用说明
  - <https://platform.openai.com/docs/deprecations>
- Anthropic 发布说明
  - <https://platform.claude.com/docs/en/release-notes/overview>
- Anthropic 工具调用说明
  - <https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use>
- Anthropic 扩展思考说明
  - <https://platform.claude.com/docs/en/build-with-claude/extended-thinking>

## 二级正式参考

### `sanbuphy/claude-code-source-code`

- 仓库地址：<https://github.com/sanbuphy/claude-code-source-code>
- 作用：帮助我们更快看清已发布 Claude Code 的 CLI 启动层、主循环、工具执行、权限链路、压缩策略、远端桥接和任务式多代理。

这个仓库能给我们的帮助主要有三点：

- 帮助列结构图和能力地图。
- 帮助发现哪些外层能力值得迁移到 `Codex Code`。
- 帮助补充“为什么 Claude Code 更好用”的产品层原因。

它的边界也必须写清楚：

- 它不是 Anthropic 原始单仓库。
- 它基于已发布包还原而来，不是完整开发仓库。
- 它缺失一批被构建过程裁掉的模块。
- 它混有仓库作者自己的解释和补丁脚本。

因此，它可以用来辅助设计和校对检查清单，但不能替代一级依据。

## 使用规则

- 判断 Claude Code 的内部实现细节时，优先看本仓库导入的源码快照。
- 判断 Codex 的内部设计时，优先看本地 `codex` 源码。
- 判断公开发布时间、模型弃用、对外接口能力时，优先看官方公开资料。
- 第三方仓库只用于帮助理解结构，不作为唯一证据。

## 当前固定事实

- OpenAI 新 Codex 产品公开时间：`2025-05-16`
- Anthropic OpenAI 兼容端点发布时间：`2025-02-27`
- `codex-mini-latest` 弃用迁移说明日期：`2026-02-12`

这些事实说明后续模型名、能力和工具支持都必须配置化，不能把单个模型快照写死到代码里。

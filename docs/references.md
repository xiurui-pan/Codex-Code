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

### `external2.md` 提炼方向

仓库里当前没有把 `external2.md` 作为正式基线文档保存下来，但用户已经明确了其中对本项目最有帮助的几类内容。后续研究时，优先按这几条去核对 Claude Code 与 Codex Code 的差异：

- 系统提示词结构
- 记忆系统
- 上下文管理
- 工具优先
- 验证链
- 子代理
- 安全护栏

这几条里，系统提示词结构和记忆系统已经进入总计划；上下文管理、工具优先、验证链、子代理、安全护栏则作为后续设计和取舍的重要观察点。

### `instructkr/claw-code`

- 仓库地址：<https://github.com/instructkr/claw-code>
- 定位：辅助参考

它可以帮助我们了解社区如何围绕 Claude Code 做二次整理或改造，但它不是当前项目的源码基线，也不是当前实现目标。

### `InDreamer/co-claw-dex`

- 仓库地址：<https://github.com/InDreamer/co-claw-dex>
- 定位：高价值社区参考，但不是替代路线

这个仓库的参考价值很高，原因主要有三点：

- 它已经证明：保留 Claude Code 风格 CLI、工具链和权限循环，同时把模型后端接到 OpenAI/Codex 兼容 Responses，是可以做成一个真实可跑 fork 的。
- 它把 `~/.codex/config.toml`、`~/.codex/auth.json`、`OPENAI_API_KEY` 这些本地配置来源接得比较完整。
- 它对 Responses 流式事件、函数调用和请求身份信息做了较完整的边界适配，适合用来观察社区里“如何快速跑通一条可用主链”。

但它的边界也要写清楚：

- 它本质上是边界翻译型 fork，主思路是把 OpenAI/Responses 再翻回 Claude Code 既有内部流和消息形状。
- 它保留了大量旧的 Claude 兼容投影、旧模型别名和旧能力字段。
- 它不是当前 `Codex-Code` 这条 `Codex-only` 内部收口路线的替代方案。

因此，对当前项目最合适的用法是：

- 借它的外围经验，例如 `.codex` 配置接法、请求身份元信息、快速落地方式。
- 不照搬它“长期维持边界翻译层和旧内部形状”的总体路线。

### `shipany-ai/open-agent-sdk`

- 仓库地址：<https://github.com/shipany-ai/open-agent-sdk>
- 定位：辅助参考

这个仓库只保留为辅助参考，用来扩展视野，不作为源码基线，也不作为当前实现目标。用户已经明确：当前项目不进入 SDK 方向，因此不会把 `open-agent-sdk` 当成这一阶段的演进路线。

### `external-ban.md` 边界结论

这条边界已经明确，不只是当前阶段不做，长期也不打算保留。下面这些都属于 Claude Code 原始产品侧机制，不属于自定义 Codex provider 路线需要继承的能力：

- Anthropic 第一方账号体系
- OAuth
- 订阅特权
- 环境画像
- 遥测上报
- GrowthBook
- 远程策略
- 反蒸馏
- 防伪 header
- 封号信号

原因很直接：`Codex-Code` 当前走的是自定义 Codex provider 路线，模型来源、认证方式、调用地址、权限边界都由本地配置和外部 provider 决定，不依赖 Anthropic 自家产品账号、订阅体系、增长实验、远端风控或封禁信号。这些机制即使在 Claude Code 原产品里有意义，迁到当前项目里也不会增强本地可用性，反而会把产品侧耦合重新带回来。

因此，当前项目只保留需要改写成中性能力的部分：

- 本地会话 ID
- 本地配置优先级
- 通用能力门
- 本地诊断日志

这几项仍然需要，因为它们服务的是本地运行、配置解析、能力裁剪和排障，不依赖 Anthropic 第一方产品体系。

## 使用规则

- 判断 Claude Code 的内部实现细节时，优先看本仓库导入的源码快照。
- 判断 Codex 的内部设计时，优先看本地 `codex` 源码。
- 判断公开发布时间、模型弃用、对外接口能力时，优先看官方公开资料。
- 第三方仓库只用于帮助理解结构，不作为唯一证据。
- 当前正式源码基线始终是 `upstream/claude-code/`，不会被 `claw-code`、`open-agent-sdk` 或其他第三方仓库替代。
- 对照 Claude Code 原始产品机制时，要先区分“通用代理能力”和“Anthropic 产品侧机制”；后者默认不迁入 `Codex-Code`，除非后续有新的明确目标重新定义边界。

## 当前固定事实

- OpenAI 新 Codex 产品公开时间：`2025-05-16`
- Anthropic OpenAI 兼容端点发布时间：`2025-02-27`
- `codex-mini-latest` 弃用迁移说明日期：`2026-02-12`

这些事实说明后续模型名、能力和工具支持都必须配置化，不能把单个模型快照写死到代码里。

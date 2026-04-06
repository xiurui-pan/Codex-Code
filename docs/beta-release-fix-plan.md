# Codex Code 发布前问题收口修复计划

## 简述

本轮修复目标不是继续零散补丁，而是把当前阻塞 beta 发布的几类核心问题一次性收口：TUI 启动异常、plan 模式行为异常、agent 结果展示缺失、`/context` 口径混乱、bash 失败输出缺失、路径注入不稳定，以及剩余用户可见的 Claude / Anthropic 文案与功能残留。

当前只读调研已经确认，最大的问题不是某一个孤立 bug，而是几处“Codex provider 分支改造”把原本 Claude Code 的默认行为改歪了，尤其是 plan 模式和 agent 展示链路。

## 关键改动

### 1. 修正 plan 模式分支，恢复“调研后收口出完整 plan，再申请批准执行”的主流程

- 调整 `src/utils/planModeV2.ts`，不要再对自定义 Codex provider 无条件开启 interview workflow。
- 调整 `src/tools/EnterPlanModeTool/prompt.ts`，Codex provider 不再默认复用 ant 的保守访谈式提示词，而是回到和 Claude Code 主流程一致的 plan 进入逻辑。
- 调整 `src/utils/messages.ts` 中 plan mode 的系统提示，明确：
  - 主流程是先调研、再产出完整 plan、再请求用户批准执行。
  - 只有在确实存在高影响不确定项时，才允许提问或增量更新 plan。
  - `update plan` 不应成为“每看一点文件就调用一次”的常规动作。
- 保留必要的 Codex 本地化约束，但不要改变 plan 模式的基本交互节奏。
- 明确 plan 模式退出条件：
  - 用户回答完问题后，必须展示完整 plan。
  - 未获得批准前不得直接退出 plan 模式。
  - `update plan` 只是中间状态同步，不等价于完成 plan 或自动批准。

### 2. 修正子代理使用策略，避免 main session 和 plan agent 重复读文件

- 检查并调整 plan 模式中 Explore agent / Plan agent 的启用条件，让它更接近 Claude Code 的预期行为：
  - 主会话先做轻量定位；
  - 需要并行信息搜集时再派 Explore agent；
  - 需要写正式 plan 时才启用 Plan agent。
- 限制 plan agent 的重复全量读文件行为：
  - 如果主会话已经完成文件筛选，应把聚焦范围传给 plan agent，而不是让它重新把 prompt 涉及文件全读一遍。
  - 能传结构化上下文就传结构化上下文，避免只传宽泛自然语言任务描述。
- 对照 `codex-rs cli` 的计划模式，把“主会话调研”和“子代理生成计划”之间的上下文传递策略统一为尽量复用已筛选信息，而不是重复扫描仓库。
- 把“是否积极使用子代理”从弱建议改成明确策略：
  - 单线程足够时不强行起子代理；
  - 一旦任务明显可并行，就优先派 Explore agent；
  - Plan agent 只负责收口，不负责重新调研全仓。
- 明确一条实现原则：普通子代理能力默认应视为与 Claude / Anthropic 第一方协议解耦，换模型或换 provider 也应可工作；现阶段若出现与上游不一致，应优先按本地代码逻辑或产品分支错误处理，而不是默认归因于 Codex provider 不兼容。
- 对子代理相关能力做能力分层：
  - 普通 subagent、后台 agent、agent transcript、agent completion notification 默认目标是尽量对齐 Claude Code；
  - 只有在能明确证明某条分支依赖 Anthropic 第一方基础设施时，才允许单独降级或禁用。

### 3. 修正 agent 展示链路，让 `Ctrl+O` 前后的行为都符合预期

- 修正 `src/tools/AgentTool/UI.tsx`：
  - 非 transcript 模式下，agent 卡片应直接显示最终回复的摘要或完整最终文本，不应只显示 `Done (...)`。
  - transcript 模式下继续展示完整工具轨迹和最终回复。
- 调整 `getResponseContentFromProgressMessages(...)` 与 completed result 的组合逻辑，确保：
  - 同步 agent 有结果时，结果进入 Agent 卡片；
  - 异步 agent 完成后的任务通知也能把 final message 传回主界面；
  - 不会只在 main session 后续总结里看到结果，而 agent 自己的卡片为空。
- 检查 `src/components/Messages.tsx` 的消息过滤、分组、压缩逻辑，避免把 agent 的最终 assistant 内容当成可折叠中间消息丢掉。
- 一并修正“除了最终结果之外看不到中间提示性文字”的问题：
  - 保证 progress 类提示在主界面有可见表达；
  - 不要因为过度压缩导致用户只能看到起点和终点。

### 4. 修正 bash 失败态显示，让红色失败命令也能看到关键输出

- 调整 `src/tools/BashTool/UI.tsx` 与 `src/components/FallbackToolUseErrorMessage.tsx`：
  - 失败态不能只显示笼统错误文本；
  - 应优先显示真实 stderr/stdout 的关键片段。
- 保留截断，但改成“优先展示最有信息量的尾部或关键片段”，而不是机械只取前 10 行。
- 统一成功态、运行中、失败态的展示口径，避免“绿的和白的有输出，红的反而没内容”。
- 确保 transcript 展开后能看到完整失败输出。

### 5. 修正 `/context`，统一口径并排查 context 异常偏高

- 明确区分两组指标并在界面上写清楚：
  - 当前上下文估算值；
  - 最近一次 API usage 快照。
- 调整 `/context` 顶部摘要文案，避免用户误以为顶部总数和下方分解必须完全同值。
- 检查 `src/utils/analyzeContext.ts`、`src/utils/tokens.ts`、`src/commands/context/context-noninteractive.ts` 的计算链，统一以下规则：
  - headline total 用哪种口径；
  - category breakdown 用哪种口径；
  - usage snapshot 只作为对照值还是参与总数展示。
- 对照 `codex-rs` 的上下文统计实现，排查 Codex Code 当前 context 偏高的来源，重点检查：
  - system prompt 分段；
  - tools / slash commands / MCP tools 注入；
  - agent/tool progress 留在上下文里的冗余内容；
  - memory / CLAUDE.md / 附件重复注入；
  - plan mode 下额外读文件和计划文本带来的上下文膨胀。
- 目标是让 `/context` 同时做到“数字对得上”和“能解释为什么高”。

### 6. 继续排查并修复 TUI 启动与路径注入问题

- 对 `src/entrypoints/cli.tsx`、`src/main.tsx`、`src/replLauncher.tsx`、`src/ink.ts`、`src/ink/root.ts`、`src/utils/renderOptions.ts`、`src/utils/fullscreen.ts` 做一次完整启动链梳理。
- 在不改变用户体验的前提下补足更细的启动探针，钉死“进不去 TUI”到底卡在：
  - `launchRepl` 前；
  - `renderAndRun`；
  - Ink root render；
  - alt-screen / terminal capability 切换；
  - 某个首次 render 的 React 组件。
- 同步检查 `~/.local/bin/codex-code` 本地启动链路，确保：
  - `pnpm build && pnpm install:local` 后能直接 `codex-code` 启动；
  - 启动失败时有可见错误，而不是无回显挂住。
- 处理路径注入问题：
  - 核对 `getCwd()`、`setCwdState()`、`setOriginalCwd()` 在启动、resume、worktree、subagent、plan mode 中的时序；
  - 保证系统提示中的工作目录在一次会话里稳定，不会先错后对。

### 7. 清理用户可见的 Claude / Claude Code / Anthropic 文案与残余功能

- 全仓再次审计用户可见文案，重点覆盖 README、状态提示、错误提示、自动更新、doctor、slash 命令帮助、TUI 标题、提示词、测试快照。
- 所有对外文案必须统一为 Codex Code，不再出现面向终端用户的 Claude / Claude Code / Anthropic 产品描述。
- 保留内部兼容层、环境变量、配置目录名称时，只能在用户看不到或确有兼容性必要的地方存在。
- 明确禁用所有不应启用的 Anthropic / Claude 相关 slash 功能和产品链路，包括但不限于：
  - login / bridge / assistant / Claude in Chrome / Claude.ai 专属功能；
  - 任何依赖 Anthropic 第一方基础设施的命令入口。
- 对已禁用功能，返回清晰的 Codex 化错误说明，而不是半残状态或 provider 报错。

### 8. 发布前文档与安装链路收口

- 重写 README，去掉过程性开发记录，改为面向 beta 用户的发布文档。
- README 需要突出：
  - 尽可能保留原版 Claude Code 的 harness、TUI 元素、交互逻辑、操作习惯；
  - 但模型链路已经切到 Codex / OpenAI Responses。
- 明确写清：
  - 构建步骤；
  - 本地安装步骤；
  - `codex-code` 命令的安装与 PATH 要求；
  - 常见启动失败排查方法。
- 如果当前 `install:local` 仍不足以覆盖真实机器上的直接启动场景，就补安装脚本或补自检提示，保证“装完即可从命令行启动”。

## 测试与验收

- 补或改 TUI 验收测试，覆盖：
  - `codex-code` 本地安装后可进入 TUI；
  - 首屏正常显示，不是挂起无回显；
  - 启动时工作目录显示正确且稳定。
- 补或改 plan 模式测试，覆盖：
  - 调研后展示完整 plan；
  - 回答问题后不会直接退出；
  - 未批准前不会自动执行；
  - 不会反复 `update plan` + 继续大范围读文件。
- 补或改 agent 展示测试，覆盖：
  - `Ctrl+O` 前 agent 卡片能看到最终回复；
  - `Ctrl+O` 后 transcript 能看到完整回复和工具轨迹；
  - 异步 agent 完成通知能把最终文本正确显示。
- 补或改 bash 展示测试，覆盖：
  - 失败命令红色状态下可见关键错误输出；
  - transcript 展开后能看到完整失败信息。
- 补或改 `/context` 测试，覆盖：
  - 顶部数字与分解口径说明一致；
  - cached input / current input / total tokens 的展示符合当前 provider 口径；
  - 不会出现明显误导性不一致。
- 补或改文案与命令面测试，覆盖：
  - 用户可见文案不再残留 Claude / Anthropic；
  - 被禁用的 slash 功能不会出现在命令列表或提示里；
  - `/btw`、agent、plan 等现有功能在 Codex provider 下可正常工作。

## 假设与默认决策

- 默认目标是最大程度对齐 Claude Code 的已验证交互体验，但不保留任何依赖 Anthropic 第一方基础设施的产品功能。
- plan 模式默认采用“调研后完整出 plan，再批准执行”的流程，不再让 Codex provider 默认走持续访谈式分支。
- agent 卡片默认应直接展示结果摘要，这是用户可见预期，比极简 `Done (...)` 更重要。
- `/context` 默认把“当前真实占用”和“API 快照”分开展示，不再试图用模糊文案把两套口径混在一起。
- 安装链路默认以 `pnpm build && pnpm install:local` 后可直接执行 `codex-code` 为验收标准。

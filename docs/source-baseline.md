# Claude Code 源码基线

## 基线范围

这份文档固定当前迁移分析对应的源码状态，后续所有开发和讨论默认都以这份基线为准。

## 参考源

- `claude-code`
  - 本地路径：`/home/pxr/workspace/CodingAgent/claude-code`
  - 导入提交：`936e6c8e8d7258dd1b2bc127d704f02cc23076d5`
  - 当前状态：工作树干净
- `codex`
  - 本地路径：`/home/pxr/workspace/CodingAgent/codex`
  - 参考提交：`4c72e62d0bf345a57749cfd867951be1a49162b6`
- 基线日期：`2026-03-31`

## Claude Code 的关键入口

### 查询与模型调用

- `src/query/deps.ts`
  查询层直接把 `callModel` 绑定到 `queryModelWithStreaming`。
- `src/query.ts`
  请求参数里直接携带 `fallbackModel`、`effortValue`、`advisorModel`、`taskBudget`、`skipCacheWrite` 等 Claude 风格字段。

### 客户端与请求构造

- `src/services/api/client.ts`
  直接构造 `Anthropic`、`AnthropicBedrock`、`AnthropicFoundry`、`AnthropicVertex`。
- `src/services/api/claude.ts`
  这是最重的耦合点，负责系统提示切块、缓存控制、思考开关、工具定义、重试、流式事件解析、用量统计。

### 模型能力与界面

- `src/utils/thinking.ts`
  直接判断 Claude 模型是否支持思考和自适应思考。
- `src/utils/model/model.ts`
  模型别名、展示名、默认模型都按 Claude 产品线组织。
- `src/commands/model/model.tsx`
  `/model` 命令直接面向 `Opus / Sonnet / 1M / fast mode` 这套概念。
- `src/components/ModelPicker.tsx`
  模型选择界面也依赖相同的产品假设。

### 工具、附件、钩子

- `src/tools.ts`
  工具池组装、内置工具与 MCP 工具合并、deny 规则过滤。
- `src/utils/attachments.ts`
  agent 列表、todo 提醒、task 提醒、工具描述稳定化都在这里。
- `src/utils/hooks.ts`
  用户提交、权限请求、压缩前后、子代理启动、工作树等钩子入口。

### 权限、远端会话与交互

- `src/hooks/useRemoteSession.ts`
  远端消息转换、进行中的 `tool_use` 状态、权限请求队列。
- `src/interactiveHelpers.tsx`
  工作区信任、MCP 审批、危险模式确认。
- `src/setup.ts`
  安全门槛、跳过权限检查、钩子初始化。

## 当前最强的耦合点

### 1. 协议耦合

`claude.ts` 不是单纯“调用 Claude 的客户端”，而是把 Anthropic Beta Messages 当成了公共协议本身。

### 2. 流式事件耦合

上层状态机直接理解 `message_start`、`content_block_delta`、`tool_use`、`server_tool_use`、`thinking_delta`、`signature_delta` 这些事件。

### 3. 模型能力耦合

`thinking`、`adaptive thinking`、`1M`、`fast mode`、`extra usage` 都按 Claude 的产品规则计算，不是按通用能力计算。

### 4. 工具循环耦合

成功判定、远端会话展示、权限状态清理都默认 `tool_use -> tool_result` 这个回合结构。

### 5. 系统提示和缓存耦合

系统提示切块、`cache_control`、提示缓存断点、header latch 都按 Anthropic 的设计来维持稳定。

## 这份基线的用途

后续改造要先做内部中间层，再做模型适配，原因很直接：

- 如果不先抽中间层，Codex 只能被伪装成 Claude。
- 如果不先抽模型能力表，界面、权限、工具和提示策略会继续被 Claude 的产品词绑死。
- 如果不先抽工具和权限对象，远端会话与本地会话会一起被旧回合结构拖住。

## 更新规则

- 只要 `claude-code` 的参考提交变化，就先更新这份基线。
- 只要我们对“哪里耦合最深”的判断变化，就同步更新 `docs/analysis.md`。
- 只要实施顺序变化，就同步更新 `docs/roadmap.md`。

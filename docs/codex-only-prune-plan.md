# Codex-only 收缩审计（阶段二/三前）

本清单只基于当前源码现状，目标是把主链进一步收缩到 `custom Codex provider`，并避免“功能看似可用、实现仍被 Anthropic/多 provider 逻辑牵制”。

## 1) 仍阻塞 Codex-only 主链的关键模块（路径级）

### A. API 请求主干仍是多分支路由
- `upstream/claude-code/src/services/api/model.ts`
- `upstream/claude-code/src/services/api/claude.ts`
- `upstream/claude-code/src/services/api/client.ts`
- `upstream/claude-code/src/services/api/streamingRequestDispatch.ts`
- `upstream/claude-code/src/services/api/withRetry.ts`
- `upstream/claude-code/src/services/api/errors.ts`

现状：`codexResponses.ts` 已接入，但主链仍保留大量 Claude/多 provider 分支，错误分类、重试策略、流分发也还在按 provider 分裂。

### B. 模型与 provider 选择层仍内置四套 provider
- `upstream/claude-code/src/utils/model/providers.ts`
- `upstream/claude-code/src/utils/model/model.ts`
- `upstream/claude-code/src/utils/model/configs.ts`
- `upstream/claude-code/src/utils/model/modelStrings.ts`
- `upstream/claude-code/src/utils/model/validateModel.ts`
- `upstream/claude-code/src/utils/model/bedrock.ts`
- `upstream/claude-code/src/utils/model/deprecation.ts`

现状：默认模型、别名、能力、下线日期仍按 `firstParty/bedrock/vertex/foundry` 维护，Codex-only 还在背历史兼容包袱。

### C. Anthropic 产品态能力仍在主代码树
- `upstream/claude-code/src/bridge/*`（整目录）
- `upstream/claude-code/src/remote/*`
- `upstream/claude-code/src/hooks/useReplBridge.tsx`
- `upstream/claude-code/src/bridgeEnabled.ts`（通过 `bridge` 相关引用链生效）

现状：`claude.ai` 远程桥接、OAuth、Remote Control 逻辑仍是可编译主模块，增加维护与回归面。

## 2) 每块的移除/收窄策略

### A. API 主干
- 策略：**隔离后删除**
- 做法：
  - 先把 `src/services/api/model.ts` 的实际请求路径固定到 `codexResponses`（保留极薄兼容层）。
  - `claude.ts`、`streamingRequestDispatch.ts`、`withRetry.ts` 中仅保留 Codex 路径需要的公共工具；其余 provider 分支迁到 `legacy/` 并停止默认引用。
  - 第二步再物理删除不再被引用的分支文件。

### B. 模型/provider 层
- 策略：**直接收窄**
- 做法：
  - `providers.ts` 收窄为单值（`custom`）或仅保留 Codex 路由开关，不再暴露四套 provider 枚举。
  - `model/configs/modelStrings/validateModel/deprecation` 只保留 Codex 模型集合和校验。
  - `bedrock.ts` 这类仅 3P provider 用模块直接删。

### C. Bridge/Remote 产品态
- 策略：**后置（先隔离，后删除）**
- 做法：
  - 短期：在命令入口和初始化流程彻底断开默认引用（构建可选加载，不进主链）。
  - 中期：若一轮版本内无保留诉求，直接删除 `src/bridge/*`、`src/remote/*` 及对应 UI 挂钩。

## 3) 依赖风险与建议改造顺序（4步）

### 第1步：先锁 API 实际调用主链（风险最低，收益最高）
- 目标：保证线上实际请求只走 `codexResponses.ts`。
- 风险：
  - 某些错误提示文案仍来自 `errors.ts` 旧分支，可能出现不一致。
  - 统计埋点还在读取 provider 枚举。

### 第2步：再收窄模型/provider 选择层
- 目标：从“多 provider 兼容”变为“Codex-only 明确约束”。
- 风险：
  - `modelOptions`、`Doctor`、设置迁移逻辑可能依赖旧 provider 字段。
  - 旧配置用户启动时可能遇到模型名不识别，需要清晰报错。

### 第3步：最后处理 bridge/remote 产品态
- 目标：把 Anthropic 产品能力移出主链编译和默认运行路径。
- 风险：
  - 命令清单与帮助文案要同步，避免残留入口。
  - 某些 hook/状态字段会出现“只写不读”或“只读不写”。

### 第4步：清理遗留与文档对齐
- 目标：删死代码、补文档、补最小回归测试矩阵。
- 风险：
  - 删除跨模块常量后可能触发类型连锁报错，需要一次性清干净。

## 4) 每一步可验证测试命令

以下命令都可直接执行，且与“Codex-only 主链可用性”直接相关：

### 第1步（API 主链锁定）
- `cd upstream/claude-code && node --test tests/codexResponsesTimeoutProvider.test.mjs`
- `cd upstream/claude-code && node --test --test-name-pattern "/compact TUI: resume compacts locally" tests/coreSlashCommandsAcceptance.test.mjs`

### 第2步（模型/provider 收窄）
- `cd upstream/claude-code && node --test tests/model.test.ts`
- `cd upstream/claude-code && node --test tests/modelTurnItems.test.ts`

### 第3步（交互主链稳定）
- `cd upstream/claude-code && node --test --test-name-pattern "/plan TUI|/memory|/files" tests/coreSlashCommandsAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/tuiMultiTurnStabilityAcceptance.test.mjs`

### 第4步（memory 收口回归）
- `cd upstream/claude-code && node --test tests/memoryCodexOnlyMode.test.mjs`


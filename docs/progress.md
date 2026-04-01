# 开发进展

项目目标：以 `claude-code` 为直接基线，逐步把模型接入层改造成更适配 Codex 的形式，同时尽量保留原有工具、权限和主循环体验。

## 已完成

- `44637ed` `docs: add codex code baseline and upstream snapshot`
  固定了文档基线、分析结论和 `upstream/claude-code` 源码快照，明确项目不是单纯协议替换。

- `83ecf76` `feat: add codex code prototype baseline`
  建立了最小协议验证样本，用来核对 provider、Responses 请求形状和基础标准化路径。

- `4d838a7` `fix: handle responses stream failures`
  补齐了 Responses 流式错误路径，避免 200 状态下的错误事件被误当成功。

- `6099b04` `refactor: recenter codex code on claude-code baseline`
  完成第一轮纠偏，把 prototype 从主线降回验证样本，重新把正式改造主线拉回 `claude-code` 基线。

- `f994214` `refactor: add model facade for query deps`
  新增 `src/services/api/model.ts` 作为最小中立 facade，并让 `query/deps` 先走这层入口。

- `7869d4d` `refactor: route web search through model facade`
  把 `WebSearchTool` 的模型调用入口改接到 facade，行为保持不变。

- `6d1dcec` `refactor: route compact through model facade`
  把 `services/compact/compact.ts` 需要的流式调用和最大输出 token 查询接到 facade，继续保持原实现委托给 Claude。

- `2cd61dc` `docs: add development progress log`
  新增仓库内的持续进展记录文件，开始按轮次记录已完成提交、当前进行中和下一步。

- `aba4abf` `refactor: route side queries through provider client`
  新增 `services/api/providerClient.ts` 这层最小客户端 facade，并把侧边查询先接到这层入口，继续委托现有 `client.ts`。

- `136206f` `refactor: route model capabilities through provider client`
  把模型能力相关的一条 client 侧链先接到 `providerClient` facade，继续收窄直接依赖 `client.ts` 的范围。

- `8003f17` `refactor: route claude ai limits through provider client`
  把 Claude AI limits 这一条 client 侧链旁路到 `providerClient`，继续保持原行为不变。

- `648e077` `refactor: route token estimation through provider client`
  把 token estimation 的客户端入口接到 `providerClient`，继续沿着 `services/api/client.ts` 侧链做最小替换。

- `1579cb0` `refactor: route query engine usage through model facade`
  把 `QueryEngine` 需要的 usage helper 接到 `services/api/model.ts`，让主查询链的一部分先从 facade 取入口。

- `1bf24e0` `refactor: route forked agent usage through model facade`
  把 forked agent 这条 usage 路径接到 `model` facade，继续减少外围代码直接依赖 Claude 专名实现。

- `c4569b7` `refactor: route helper callers through model facade`
  把一整批非流式和小模型 helper callers 接到 `model` facade，明显扩大了中立调用面的覆盖范围。

- `b0b9144` `refactor: route request helpers through request config facade`
  新增 `src/services/api/requestConfig.ts` 作为 `getAPIMetadata`、`getExtraBodyParams`、`getCacheControl` 的统一入口，并把 `claudeAiLimits`、`tokenEstimation`、`sideQuery`、`yoloClassifier` 这 4 个外部调用点从直接依赖 `claude.ts` 改成走这层入口，继续压缩外围代码对 `services/api/claude.ts` 的直连面。

- `f064633` `refactor: route remaining small-model callers through facade`
  把剩余外围小模型调用继续接到 `model` facade，进一步清理外部对 `queryHaiku` 这类 Claude 专名入口的直接依赖。

- `236e35a` `refactor: move request config helpers out of claude api`
  把请求配置家族从 `claude.ts` 内部继续拆出，形成 `requestConfig.ts` / `requestCacheControl.ts` 这组更清晰的宿主入口，并明确不再保留 Anthropic 专用的 `anti_distillation` 相关逻辑。

- `c7e95bd` `refactor: move request prompt assembly out of claude api`
  把请求构造主段从 `claude.ts` 内部继续拆出到 `requestPromptAssembly.ts`，并保持 Claude Code 现有的 system prompt 骨架、提示词内容和拼接顺序不变。

- `9a1c7af` `refactor: move request params builder out of claude api`
  把 `paramsFromContext` 这层请求参数构造逻辑搬到 `requestParamsBuilder.ts`，并让 `claude.ts` 改成调用这层；同时保持 system prompt 骨架和流式解析主干不变。

- `3bf8c47` `refactor: move request preflight state out of claude api`
  把请求前置状态准备这一层搬到 `requestPreflightState.ts`，并让 `claude.ts` 改成调用这层；同时保持 system prompt 骨架、`paramsFromContext` 本体和流式解析主干不变。

- `2f82d3a` `refactor: move request input preparation out of claude api`
  把请求输入准备主段搬到 `requestInputPreparation.ts`，覆盖 `messagesForAPI` 归一化、tool-search 后处理、tool result 成对修复、advisor/media 清理、指纹、deferred tools prepend、Chrome 指令注入，以及 `systemPrompt/system/allTools` 组装；同时保持 Claude Code 现有的 system prompt 骨架和流式解析主干不变。

## 当前进行中

- `providerClient`、`model`、`requestConfig` 三条入口已经初步成形，外围外部直连点也已经基本清零，当前已经进入 `services/api/claude.ts` 内部能力拆分阶段。
- `requestInputPreparation` 已经提交，当前大块是请求派发层抽离，范围包括 query logging、`withRetry` 建流、stream 建立，以及预流式错误透传这几段从 `claude.ts` 主体继续拆出。
- 当前目标是继续缩小 `claude.ts` 的请求派发主段，但不改 system prompt 骨架、输入归一化顺序、流式事件解析主干和 QueryEngine 收口。
- `upstream/claude-code` 当前仍然只是源码快照加 README，目录下没有 `package.json`、锁文件、`tsconfig.json` 和可直接执行的运行入口，所以当前仓库还不能直接做真实 TUI 试跑。
- 明确不再保留 Anthropic 专用的 `anti_distillation` 逻辑，后续拆分以通用调用能力为主。
- 控制改动范围，避免又回到 prototype 扩功能的路线。

## 下一步

- 先完成并验证请求派发层抽离这一块，确保 query logging、`withRetry` 建流、stream 建立和预流式错误透传的行为不漂。
- 这一块稳定后，再继续从 `services/api/claude.ts` 内部挑选最小的高频能力接缝，优先考虑请求发送后的流式收包辅助层，而不是直接碰主循环收口。
- 下一大块需要明确补齐 `upstream/claude-code` 的可运行壳层条件：补项目清单与依赖入口，明确可执行命令和运行方式，让仓库具备真实 TUI 试跑前提，而不是继续停留在只读源码快照状态。
- 优先选择高频复用、但写入范围还能控制住的主链入口，避免一次跨太大。
- 在 facade 足够稳定后，再进入下一层：抽更中立的调用类型和回合边界。
- 每轮都同步更新这份文件，记录已完成提交、当前进行中和下一步。

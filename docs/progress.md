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

- 未提交：外围小模型调用收口
  继续清掉剩余外部对 `services/api/claude.ts` 的直接模型调用，把 `Feedback.tsx` 和 `utils/teleport.tsx` 从 `queryHaiku` 改到 `model` facade 的 `callSmallModel`，进一步收紧外围外部对 Claude 专名入口的依赖。

## 当前进行中

- 继续清点 `upstream/claude-code` 里仍然直接从 `services/api/client.ts` 和 `services/api/claude.ts` 取入口的路径。
- `providerClient`、`model`、`requestConfig` 三条入口已经初步成形，外围外部直连点也已经基本清零，当前正在把焦点转向 `services/api/claude.ts` 内部能力拆分。
- 当前焦点正在从 client 侧链和辅助函数层，逐步转向更核心的主循环入口和回合边界。
- 控制改动范围，避免又回到 prototype 扩功能的路线。

## 下一步

- 开始挑选最小的 `services/api/claude.ts` 内部能力接缝，继续向查询主循环和回合边界推进。
- 逐步把高频复用、但仍然写死在 `claude.ts` 内部的能力拆到更清晰的 facade 或辅助层。
- 优先选择高频复用、但写入范围还能控制住的主链入口，避免一次跨太大。
- 在 facade 足够稳定后，再进入下一层：抽更中立的调用类型和回合边界。
- 每轮都同步更新这份文件，记录已完成提交、当前进行中和下一步。

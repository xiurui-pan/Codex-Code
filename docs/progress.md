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

## 当前进行中

- 继续清点 `upstream/claude-code` 里仍然直接从 `services/api/claude.ts` 取模型调用的路径。
- 逐步把这些直连点旁路到 `services/api/model.ts`，先只做入口替换，不改行为。
- 控制改动范围，避免又回到 prototype 扩功能的路线。

## 下一步

- 继续替换剩余的 Claude 直连点，优先处理查询主链路和少数公共调用点。
- 在 facade 足够稳定后，再进入下一层：抽更中立的调用类型和回合边界。
- 每轮都同步更新这份文件，记录已完成提交、当前进行中和下一步。

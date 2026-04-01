# 开发进展

项目目标：以 `claude-code` 为直接基线，逐步把模型接入层改造成更适配 Codex 的形式，同时尽量保留原有工具、权限和主循环体验。

当前项目里，“请求和消息”与“本地执行链”不是两套互不相关的东西。很多能力最终会体现在请求和消息里，但启动链、REPL、`QueryEngine`、`query`、工具执行、权限、结果回灌、TUI 渲染这些能力必须由本地执行链实现，不能简化成“把规则写进消息发给模型”。

当前阶段边界：只支持自定义 Codex provider API，不做 Anthropic 专属链路，包括 `claude.ai` 登录、OAuth、Bridge、assistant mode、proactive 等；这是当前阶段的收口范围，不代表永久删除这些能力。
当前阶段只支持自定义 Codex provider，不做多模型兼容，也不再为 Claude/Anthropic 双栈继续保留额外中间层负担。

## 已完成

- 当前阶段里，真实工具闭环与真实权限闭环已经打通。
  这一轮已经完成的关键结果包括：
  - 修掉 `upstream/claude-code` 在 ESM 运行时里的残留 `require(...)`，越过 `before-ask` 处的 `require is not defined`
  - 打通自定义 Codex provider 在 headless/structured 路径下的真实工具调用适配，不再只停留在纯文本“伪工具输出”
  - 打通 `--permission-prompt-tool stdio` 下的真实 `can_use_tool -> control_response` 权限协议
  - 已分别验证允许/拒绝两条分支：
    - 允许分支：`cd src && echo ok > perm-check.txt`
    - 拒绝分支：同一命令由宿主返回 deny
  - 两条分支都已确认走完整个闭环：工具调用、权限事件、结果回灌、最终回答
  这说明当前已经不只是“模型能回复”或“工具能偶发执行”，而是 Claude Code 原有的本地权限与工具主循环，已经在 Codex 适配层下形成最小真实闭环。

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

- 当前阶段里，自定义 Codex provider 的本地 CLI 启动链与非交互主链已经打通。
  已确认通过的验证包括：
  - `pnpm -C upstream/claude-code build`
  - `node dist/cli.js --version`
  - `node dist/cli.js --help`
  - 按 `~/.codex/config.toml` 和 `gpt-5.1-codex-mini medium` 跑真实非交互 smoke，并返回 `CODEX_CODE_SMOKE_OK`
  这说明当前阶段至少已经跑通了真实源码入口下的本地构建、CLI 启动和非交互主链，而不是停留在假入口或协议样机。

- 当前阶段里，`main import -> 可见 TUI -> 可输入 -> 真实问答` 这一整块已经完成。
  这一轮验收通过的范围包括：
  - `pnpm -C upstream/claude-code build`
  - `node dist/cli.js --version`
  - `node dist/cli.js --help`
  - 非交互 smoke
  - 真实 TTY 问答
  这说明当前项目已经不只是“能起 CLI”，而是已经打通了真实交互式 TUI 主链里的基础问答回路。

## 当前进行中

## 本轮新增进展

- 已把 Codex Responses 这一段从“伪 streaming”改成真实增量收包：`callModelWithStreaming` 不再等完整 `response.text()`，而是按 SSE `response.output_item.done` 逐项进入主链。
- 已把新的执行对象继续往上接：`QueryEngine` 现在会把 `local_shell_call / permission_request / permission_decision / tool_output / execution_result` 直接发成 `system:model_turn_item`，不再只在内部生成却不上送。
- 已继续收紧 `codexTurnItems.ts` 的文本 fallback：只有以显式工具标记起始的文本才会进入这条临时降级路径，并且会标出 fallback 警告，不再作为默认可执行侧通道。
- 已补一组更贴近行为的本地验证材料：除了现有单元测试，还新增 `upstream/claude-code/tests/headlessStreaming.smoke.mjs`，专门用本地假 Responses 服务和真实 headless CLI 去验证 request shape、SSE 增量进入主链、以及执行对象输出。

## 当前新增判断
- 这轮把 `modelTurnItems` 再拆了一层：先产出更薄的“首选回答对象”，再由单独的包装函数决定是否生成 synthetic assistant 壳，给 `query.ts` / `model.ts` 后续直接消费更薄对象留出落点。
- 同时把 `WebSearchTool` 的多 citation 边界补稳：同一次搜索的多个 citation 文本块会合并回同一个搜索结果；如果中间某次搜索没有 citation，后续 citation 至少不会错位挂到前一条，前面的空搜索会保留成零链接结果。
- 这轮又把 `model.ts` 往前推了一步：现在 streaming、非 streaming、小模型这三条文本入口都会先形成首选回答对象，再按外围兼容边界需要时才包装回 synthetic assistant。
- 还补了一条更值钱的 WebSearch 多 citation 用例：同一条 assistant message 同时承载两个搜索时，如果前一个搜索有多段 citation、后一个也有 citation，前一个会优先吃掉前面的多段 citation，后一个保留自己的 citation，不会再被前一个并吞。
- 这轮继续把核心兼容边界往里收：`query.ts` 和 `services/api/model.ts` 不再各自手搓“纯文本时直接出 assistant、否则退回 synthetic 壳”的分支，而是统一改成走 `modelTurnItems` 里的首选回答构造逻辑。
- 同时补稳了 `WebSearchTool` 的多次搜索归属：当同一轮里有多次 `web_search_call` 时，带 citation 的结果会按完成顺序归到对应的 `toolUseId`，不再全挂到最后一次搜索上。
- 这轮把 `WebSearchTool` 的 Codex 数据源假设修正成当前主路真实能看到的形状：不再按 `content_block_start/content_block_delta` 读 Anthropic 风格块事件，而是直接从 `response.output_item.done -> web_search_call` 和 assistant `message.output_text.annotations` 提取搜索进度、链接和来源文本，不再把结果降成 `No links found.` 空壳。
- 同时把上一轮新增的 `query.ts` / `compact.ts` 字符串断言测试换成真实行为测试：前者直接验证“有无 `tool_call` 时是否走纯文本回答路径”，后者直接验证摘要优先取 `modelTurnItems.final_answer`。
- 这一轮把 `WebSearchTool` 也从旧 streaming assistant 壳上往里挪了：它现在直接消费 Codex turn-item streaming，再从原始输出项里提取搜索进度和结果。
- 同时补了两条就近行为测试，明确 `query.ts` 在纯文本 turn-item 且不含 `tool_call` 时优先产出普通 assistant 文本，`compact.ts` 在摘要消息带 `modelTurnItems.final_answer` 时优先取 turn-item 文本。

- 这一轮先把 `apiQueryHookHelper` 里的静默偏差修掉了：迁到 turn-item 主路后，成功分支不再去读旧 `response.message.id`，避免把成功结果错误打进异常路径。
- 然后继续从核心边界往里收：`query.ts` 的纯文本 chunk 现在优先直接产出普通 assistant 文本消息，`services/compact/compact.ts` 的摘要提取会优先读 turn items，不再先退回旧 assistant 文本壳。

- 这一轮把 shell prefix 的错误识别也收回 Codex 主路：不再把 provider 错误当成旧 `API Error` 文本前缀去猜，而是直接按 `errorMessage` 分支处理。
- `extractFinalAnswerTextFromTurnItems()` 也补了 `separator === ''` 的边界处理：现在会保留原始块边界里的空白而不是逐块硬裁剪，避免把原本有空格的自然语言拼成一串，或把被分块的 JSON 误拼坏。
- 又迁了一批外围旧入口：`teleport.tsx`、`Feedback.tsx`、`skillImprovement.ts`、`execPromptHook.ts`、`apiQueryHookHelper.ts` 都开始直接消费 Codex turn items。

- 这一轮继续缩小旧 assistant 兼容壳的实际消费面：session title、`/rename` 名称生成、shell 前缀判断、WebFetch 二次处理这几条也开始直接消费 Codex turn items。
- 还补了 `extractFinalAnswerTextFromTurnItems()` 的行为测试，专门卡住多段拼接、空白裁剪和无最终回答时返回空字符串这三种基础风险。

- 这一轮继续把非流式文本消费者从旧 assistant 壳上往外挪：`awaySummary`、agent 生成、tool use summary、自然语言时间解析这几条已开始直接消费 Codex turn items，不再先投影回 synthetic assistant 再取文本。
- 权限对象链的测试也补到 allow 分支了：现在 headless smoke 会同时验证 deny 和 allow 两条分支都按 `permission_request -> permission_decision -> tool_output -> execution_result` 顺序上送，并检查关键 `details` 字段。

- 这一轮把权限对象链也补进了系统执行对象主路：`--permission-prompt-tool stdio` 这类宿主审批不再只靠旧消息壳侧写，headless 宿主现在可以直接从 `permission_request -> permission_decision -> tool_output -> execution_result` 这条对象顺序理解权限流。
- `model.ts` 这一层也继续往 Codex-only 主路收窄：保留兼容壳只作为外围边界，新增更直接的 turn-item 入口，避免还走 `callModelWithStreaming` / `callModelWithoutStreaming` 的调用点继续把旧 assistant 壳当主出口。


- 这一轮已经明确：Claude Code 的 harness 本身适合继续复用，真正不适合直接沿用的是默认按 Claude 表示回合、工具、审批和结果的中间结构。
- 所以接下来的主线不再是继续给 `codexResponses.ts` 增加一条条兼容分支，也不再是只改提示词或协议名，而是转向更系统地借鉴本地 `codex/` 的回合表示、能力建模和 shell / 审批 / 结果对象设计。
- 已继续往这个方向推进一小步：把 provider 返回里的工具协议杂质文本拦在统一条目归一化层，不再让拒绝分支后的脏文本继续污染后续回合。
- 已把后续两条远期目标记入计划：一是系统把残留 `Claude Code` 命名改成 `Codex Code`，二是对照 Claude Code 官方文档能力列表逐项做非 Anthropic 特化能力验收。

- 当前阶段已经明确收口：只继续推进自定义 Codex provider API 这一条主线，不再为 `claude.ai` 登录、OAuth、Bridge、assistant mode、proactive 这些 Anthropic 专属能力补齐可运行链路。
- 当前改造对象已经明确分成三类：只需提示词适配的、需要改消息生产规则的、必须本地实现的。当前重点在第三类，也就是把真实启动链、REPL、`QueryEngine`、`query`、工具执行、权限、结果回灌和 TUI 渲染继续保住并改到 Codex 路线。
- 五阶段主线不变，但已经确认后续要补强三项长期工作：记忆系统、系统提示词结构、消息类型层。这三项都已进入总计划，只是当前还不抢主链优先级。
- 另外两条新增计划也已经明确：工具提示词适配线会在后续系统梳理工具提示词、工具描述、权限文案并做 Codex 适配；隐藏功能研究线会在后续专门做研究和筛选。这两条都属于后续工作，不进入当前阶段验收。
- 真实启动链已经接入 `~/.codex/config.toml` 的最小字段，当前读取并注入的范围包括 `model_provider`、`model`、`model_reasoning_effort`、`model_providers.<id>.base_url`、`model_providers.<id>.env_key`，入口在 `cli.tsx`，主链消费在 `main.tsx`。
- `providerClient`、`model`、`requestConfig` 三条入口已经初步成形，外围外部直连点也已经基本清零，`services/api/claude.ts` 的内部拆分已经推进到真实可跑的本地 CLI、非交互主链和交互式 TUI 基础问答回路。
- 当前已经完成“先把构建跑起来”和“把交互式基础问答跑起来”这两步，后续重点不再是首屏可见性，而是把这条真实问答链继续往稳定可用推进。
- `upstream/claude-code` 的可运行面仍按这个边界收口：只服务 Codex 主链，不再以跑通 Anthropic 专属入口为目标。
- 构建校验和 CLI 可达图已经收窄到当前阶段真实主链；`sdkUrl / RemoteIO` 这一类远端传输路径当前阶段显式禁用，不再作为可运行面的一部分继续补齐。
- 明确不再保留 Anthropic 专用的 `anti_distillation` 逻辑，后续拆分以通用调用能力为主。
- 控制改动范围，避免又回到 prototype 扩功能的路线。
- 当前新的重点已经不是登录、OAuth 或远端传输链路，也不是“能不能显示首个 REPL 画面”，而是让已经打通的真实交互问答链继续稳定下来，并逐步接上后续能力。
- 当前这一整块主线已经从“打通最小权限闭环”推进到“收尾与稳定化”：后续重点不再是找权限事件，而是继续减少 provider 文本输出形状带来的适配脆弱点，并逐步把更多工具场景收进同一条稳定路径。

## 下一步

- 下一整块建议转到“交互式 TUI 真实问答回路的稳定化与扩展”。
- 下一轮可以优先整理两类稳定化工作：
  - 继续收窄 Codex provider 文本工具输出的兼容面，减少非常规文本形状带来的解析抖动
  - 把当前已验证的 headless 权限闭环继续扩到更多工具与更多权限场景
- 继续围绕 Codex provider 主链拆 `services/api/claude.ts`，优先处理与交互式问答稳定性、回合边界、模型调用中间层直接相关的能力。
- 停止为 Anthropic 专属链路补缺模块；claude.ai 登录、OAuth、Bridge、assistant mode、proactive 这些能力后续是否恢复，放到后续阶段单独评估。
- 优先围绕 `main.tsx -> replLauncher.tsx -> screens/REPL.tsx -> QueryEngine.ts -> query.ts` 这条主链，继续把真实问答、结果回灌和交互状态传递做稳。
- 接下来的文档和实现都要继续按三类对象来拆：提示词适配、消息生产规则、本地执行链，避免再把“消息层”和“执行链”说成两回事，或者误写成“只要调提示词就够了”。
- 在不改坏当前 CLI 和非交互主链的前提下，继续处理请求发送后的流式收包、主循环收口和交互层状态传递。
- 下一大块不再是“补工程壳”或“补 Anthropic 缺模块”，也不再是“让首帧出来”，而是把已经打通的真实 TUI 问答回路做稳、做深。
- 优先选择高频复用、但写入范围还能控制住的主链入口，避免一次跨太大。
- 在 facade 足够稳定后，再进入下一层：抽更中立的调用类型和回合边界。
- 当前阶段之外，后续要单列推进五个补强方向：
  - 记忆系统
  - 系统提示词结构
  - 消息类型层
  - 工具提示词适配线
  - 隐藏功能研究线
- 每轮都同步更新这份文件，记录已完成提交、当前进行中和下一步。

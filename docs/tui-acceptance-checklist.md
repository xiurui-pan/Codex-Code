# TUI 验收清单

这份清单只覆盖 `Codex-only` 本地路线下的终端交互验收。凡是依赖 `claude.ai` 登录、Anthropic 账号、远端产品态、桌面端接力、移动端接力的能力，不放进这份清单。

目标只有两个：

- 把“哪些必须自动化留证据、哪些必须人工盯界面”分清楚。
- 把正式验收矩阵里要纳入的本地交互和本地反斜杠命令先收成一份统一清单。

## 最近已收口问题（2026-04-03）

- auto-update 文案：`packageUrl` 缺失时恢复命令已固定到可执行兜底，不再出现 undefined 路径提示。
- 中断后 `/exit`：先打断再退出的真实 TUI 路径已修复，不再出现“中断后 /exit 不退出”。
- 多轮稳定性：当前自动化证据已收口到“round1 成功 + round2 中断 + `/exit` 退出”。
- `/help` + `Esc`：帮助弹层关闭后，底部提示已恢复到正常快捷键状态。
- provider silent stream：Responses SSE 长时间无事件时，已返回明确超时错误，不再静默卡住。
- request-stage timeout：请求阶段新增显式超时，等待响应过久会给出错误反馈。
- local slash 主链：当前已补到“连续本地 slash”以及“本地 slash 后继续普通提问”的真实 TUI 证据。
- permission 边界：当前 checklist 里的权限验收指工具权限弹窗；host 沙箱网络权限不在这条本地路线内。
- “请读取当前目录的所有文件然后告诉我”这类真实自然语言场景，当前已回到直接工具调用主链，不再先来回解释。
- 真实联网搜索已收口：正常对话会直接走 Codex 原生 `web_search`，CLI 输出可见 `正在联网搜索...` / `联网搜索已完成...`。

对应证据：

- `upstream/claude-code/tests/tuiKeyboardInputAcceptance.test.mjs`（含 `/exit` 中断后退出回归用例，修复提交 `9afabd4`）
- `upstream/claude-code/tests/tuiMultiTurnStabilityAcceptance.test.mjs`（当前证据只覆盖 round1 成功 + round2 中断 + `/exit` 退出，稳定化提交 `b21ff65`）
- `upstream/claude-code/tests/autoUpdaterMessages.test.ts`
- `upstream/claude-code/tests/helpDismissTuiAcceptance.test.mjs`
- `upstream/claude-code/tests/codexResponsesTimeoutProvider.test.mjs`
- `upstream/claude-code/tests/tuiDisplayInteractionAcceptance.test.mjs`（阶段五新增：窄终端中英混输+补全焦点、长输出+transcript 进出后焦点恢复）
- `upstream/claude-code/tests/claudeMdAcceptance.test.mjs`（`CLAUDE.md`、`@import`、`@文件引用` 已确认进入真实请求体）
- `upstream/claude-code/tests/coreSlashCommandsAcceptance.test.mjs`（已覆盖连续本地 slash，以及本地 slash 后继续普通提问）
- `upstream/claude-code/tests/headlessAcceptanceMatrix.test.mjs`（headless capability matrix 当前已整体验收通过）
- `timeout 80s env OPENAI_API_KEY=\"$CRS_OAI_KEY\" node dist/cli.js -p --verbose --output-format stream-json --include-partial-messages '请读取当前目录的所有文件，然后直接告诉我这个项目的结构和关键入口。不要先提问，不要解释过程。' </dev/null`（真实自然语言读目录场景已确认直接走工具）
- `timeout 140s env OPENAI_API_KEY=\"$CRS_OAI_KEY\" node dist/cli.js -p --verbose --output-format stream-json --include-partial-messages '请联网搜索 OpenAI Codex CLI 官方文档，并用中文给我三点总结。' </dev/null`（2026-04-03 复验通过：可见搜索开始/完成进度，并返回最终总结）

本轮复验命令：

- `cd upstream/claude-code && node --test tests/tuiKeyboardInputAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/tuiMultiTurnStabilityAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/helpDismissTuiAcceptance.test.mjs tests/autoUpdaterMessages.test.ts tests/codexResponsesTimeoutProvider.test.mjs`
- `cd upstream/claude-code && node --test tests/tuiDisplayInteractionAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/claudeMdAcceptance.test.mjs`
- `cd upstream/claude-code && node --test --test-name-pattern "resume restores existing plan content" tests/coreSlashCommandsAcceptance.test.mjs`

## 自动化 smoke 与人工验收的边界

### 适合自动化 smoke 的范围

- 能稳定重放的固定按键与固定流程：启动、出现 prompt、一轮真实问答、正常退出。
- 明确可判定结果的命令链路：`/help`、`/clear`、`/model`、`/effort`、`/plan`、`/resume` 这类输入后应出现固定反馈的命令。
- 明确可判定请求结果的本地上下文入口：`CLAUDE.md`、`@文件引用`、`@import` 是否真正进入主查询，或是否给出清楚失败提示。
- 关键交互的状态切换：`Ctrl+O` 切换历史视图、`Enter` 提交、`Esc` 取消当前弹层或返回输入区、`/model` 中左右切换 reasoning effort。

### 必须人工验收的范围

- 乱码、字符截断、中文宽度异常、颜色错乱。
- 布局错位、内容重叠、光标漂移、焦点丢失。
- 长输出时的滚动是否平稳，切到历史视图后是否还能回到输入区。
- 弹层、选择框、权限提示、命令补全同时出现时，是否互相打架。
- 不同终端、不同窗口宽度、缩放前后，是否还保持可读和可操作。

自动化 smoke 负责证明“主链没断”；人工验收负责兜住“终端里看起来和用起来是不是正常”。

## P0：必须先稳住的基础交互

- 启动后能看到可输入的 prompt，焦点就在输入区。
- 在真实 TTY 下完成一轮真实问答，能正常收口，再用 `/exit` 或等价退出方式正常结束。
- `Enter` 的语义稳定：普通输入提交，命令输入执行，不把半截内容误吞掉。
- `Esc` 的语义稳定：能取消当前弹层、退出当前选择态，回到输入区；如果输入框有内容，清空提示与实际行为一致。
- `Ctrl+O` 可在输入视图和历史视图之间来回切换，切换后不丢焦点、不丢输入、不出现卡死态。
- `plan mode` 的最小链路可用：进入、显示当前状态、退出或取消时都有明确反馈。
- `/model` 打开的模型选择里，reasoning effort 可用左右方向键切换；`Enter` 确认，`Esc` 取消，返回后状态与显示一致。
- 命令输入、普通提问、权限提示、结果输出四种基本状态之间切换时，不出现乱码、错位、滚动异常。

## P1：高频但可在 P0 后补齐的交互

- 反斜杠命令补全、命令选择框、帮助提示的打开、关闭、确认、取消流程。
- `CLAUDE.md` 能进入主查询；如果当前实现还没打通，至少要给出稳定、可重复的缺口测试。
- `@文件引用` 现在已能把文件内容真正带进请求；下一步主要是补更宽 TUI 联动场景。
- `@import` 如果当前有明确入口，要么真正生效，要么有明确失败测试和提示说明，不能静默失效。
- `/resume`、`/rewind`、`/clear`、`/compact` 这类会改会话状态的命令，执行前后要能看清状态变化。
- `Ctrl+O` 切到历史视图后，长消息、工具输出、权限消息的展开和回退要正常。
- `Enter`、`Esc`、左右键、上下键在命令选择框、模型选择框、权限确认框里的行为要一致，不要同键多义又没有提示。
- 粘贴长文本、多行输入、命令和普通文本混输时，输入区不应乱跳。

## P2：容易被忽略，但正式验收要补上的边角

- 长会话、多轮追问、反复切换历史视图后的滚动位置是否还稳定。
- 窗口缩放、终端宽度变化、字体变化后，提示区、输入区、历史区是否还对齐。
- 权限提示、命令补全、上下文入口提示、错误提示连续出现时，是否还能正确抢占和释放焦点。
- 中文、英文、代码块、路径、表格混排时，是否还保持可读，不出现行宽计算错误。
- 失败链路要可用：命令不存在、上下文入口失效、引用文件不存在、取消提交、取消选择，都要给出清楚提示。

## 阶段 5C 验收矩阵草案

这份矩阵只覆盖当前代码里已有本地入口、且不依赖 Anthropic 账号、Claude 产品态或外部 App 接力的能力。这里先按 `已验 / 部分已验 / 未验` 三类整理，避免把“已有一点证据”和“已经正式收口”混在一起。

### 已验

- 最小真实 TTY 主链：启动、出现 prompt、一轮真实问答、正常退出。
- `/help`：打开帮助、看到核心内容、`Esc` 关闭。
- `/config`：打开设置界面并关闭，不打 provider 请求。
- `/diff`：打开 diff 界面并关闭，不打 provider 请求。
- `/doctor`：打开诊断界面并关闭，不打 provider 请求。
- `/context`：打开本地上下文使用情况，不额外打 provider 请求。
- `/rename` + `/status`：重命名会话后，`/status` 能显示最新状态，`Esc` 可关闭。
- `/resume`：支持列表选择、`Enter` 确认、`Esc` 取消、按会话标题恢复。
- `/add-dir`：打开添加目录流程、`Esc` 取消、返回主输入，不打 provider 请求。
- `/branch`：在 resume 会话上本地分支并继续，不打 provider 请求。
- `/files`：触发命令并返回本地结果，不打 provider 请求。
- `/hooks`：触发命令并返回本地结果，不打 provider 请求。
- `/keybindings`：触发命令并返回本地结果，不打 provider 请求。
- `/mcp`：触发命令并返回本地结果，不打 provider 请求。
- `/rewind`：打开 rewind 选择器、`Esc` 关闭，不打 provider 请求。
- `/skills`：打开 skills 对话框、`Esc` 关闭，不打 provider 请求。
- `/tasks`：打开 background tasks 对话框、`Esc` 关闭，不打 provider 请求。
- `/agents`：命令已在真实 TUI 中验收，当前证据覆盖“本地接受命令并退出，不打 provider 请求”。
- `/plugin`：命令已在真实 TUI 中验收，当前证据覆盖“本地接受命令并退出，不打 provider 请求”。
- `/reload-plugins`：命令已在真实 TUI 中验收，当前证据覆盖“本地重载并退出，不打 provider 请求”。
- `/ide`：命令已在真实 TUI 中验收，当前证据覆盖“本地接受命令并退出，不打 provider 请求”。
- `/terminal-setup`：触发命令并返回本地引导信息，不打 provider 请求。
- `/theme`：打开选择器、切换主题、写入全局配置。
- `/vim`：切换编辑模式、写入全局配置；vim 模式下 `Esc` 退插入、`Enter` 提交。
- `/permissions`：打开权限界面、`Esc` 关闭；权限提示支持允许、拒绝、取消。
- `/model` + reasoning effort：模型选择、左右切换 effort、确认、取消、状态回显。

### 部分已验

- 键盘交互：`Ctrl+L`、历史上下、`Ctrl+R`、vim 下 `Esc/Enter` 的最小闭环已验通；下一步是更宽联合场景（长会话、视图切换、滚动焦点）矩阵。
- `/memory`：已经覆盖 project memory、user memory、imported memory 三条真实 TTY 路径；但 memory 专项整体还没收完，`CLAUDE.md` 主查询注入、`@import` 更宽交互、team / agent memory 还没统一收口。
- `/session`、`/summary`：当前在 Codex-only 本地路径下已覆盖“未知命令/技能”降级行为，不打 provider 请求；是否要提供正向功能还待产品决策。
- `/clear`：当前已有行为验收，但现阶段主要证据还是 headless，不应先记成完整 TTY 已验。
- `/compact`：已经补上 `--resume <transcriptPath>` 的真实 TTY 验收，但更宽 TTY 场景还没补齐。
- plan mode：已覆盖“进入 plan mode、再次查看当前为空”以及“`--resume <jsonl>` 后再次 `/plan` 读取已有计划内容”的链路；`resume existing plan` 子用例已放开并通过。
- `/agents`、`/plugin`、`/reload-plugins`、`/ide`：当前已有真实 TUI 最小闭环证据，但还没做更宽场景验收，比如连续切换、窄终端、和其他弹层/焦点状态联动。
- TUI 显示：已新增两项更宽场景证据，覆盖“窄终端中英混输 + 补全焦点稳定”和“长输出 + transcript 进出后焦点恢复”；乱码、错位、滚动、重绘矩阵仍待继续补。

### 未验

- 第二批待纳入的命令：
  - （第二批已收口）
- 第三批在本地入口稳定后纳入的命令：
  - （第三批最小闭环已补证据，更宽场景仍待做）

### 下一批最该补

- `/compact` 的真实 TTY 验收：打开、执行、状态变化、结果回显。
- plan mode 的完整交互：进入、重复进入、取消、退出、已有 plan 状态。
- 键盘交互扩大矩阵：长会话、transcript 进出、滚动与焦点恢复。
- TUI 显示专项：乱码、错位、滚动、焦点、窄终端、重绘。
- 第二批命令补证据已完成：`/add-dir`、`/branch`、`/files`、`/hooks`、`/keybindings`、`/mcp`、`/rewind`、`/skills`、`/tasks`。
- 第三批更宽场景当前优先：`/plugin`、`/reload-plugins`、`/agents`、`/ide` 的联合焦点、窄终端、重复进入退出。
- 多轮真实 TUI 稳定性回归：当前自动化证据是“round1 成功 + round2 中断 + `/exit` 退出”；更宽多轮追问场景仍待补。

下一步建议命令：

- `cd upstream/claude-code && pnpm build`
- `cd upstream/claude-code && node --test tests/helpDismissTuiAcceptance.test.mjs`
- `cd upstream/claude-code && node --test tests/codexResponsesTimeoutProvider.test.mjs`

### 明确不放进这份清单

- `/login`、`/logout`
- `/desktop`、`/mobile`、`/share`
- `/cost`、`/usage`、`/stats`、`/upgrade`
- `/pr_comments`、`/install-github-app`、`/install-slack-app`
- 其他明显依赖 Claude/Anthropic 账号、产品态、远端服务或外部应用接力的命令

## 与本地上下文入口的联动要求

后续正式 TUI 验收不能只看“上下文有没有进请求”，还要把它们放回真实交互里一起验：

- 输入时是否有清楚提示。
- 确认时是否能看见引用结果。
- 取消时是否回到输入区。
- 失败时是否有清楚错误提示。
- 在历史视图和主输入视图里，显示是否一致。

当前这条联动线至少要覆盖三类入口：

- `CLAUDE.md`
- `@文件引用`
- `@import`

当前主链已确认进入请求的包括：

- `CLAUDE.md`
- `@文件引用`
- `@import`

目前已完成的记忆相关 TUI 验收，只覆盖：

- `/memory` 打开 project memory
- `/memory` 打开 user memory
- `/memory` 打开 imported memory

还没完成的更宽 memory 验收包括：

- `CLAUDE.md` / `@文件引用` / `@import` 在更多 TUI 联动场景下的稳定性
- team memory / agent memory / 其他长期记忆入口

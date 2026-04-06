# Codex Code

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Codex Code 是一个以 Codex 为核心、运行在终端里的本地编码代理。
它想做的不是重新发明一套终端工作流，而是在保留原生 Claude Code 手感的前提下，把模型主链路切到 Codex / OpenAI Responses。

保留终端里的利落手感，拿掉账号和套餐的包袱。

如果你真正喜欢的是那套本地体验，而不是围绕 Claude / Anthropic 的一整圈服务流程，这个项目就是为你准备的。
快速的 TUI、以对话记录为中心的工作方式、slash 命令、工具调用、权限确认、会话恢复、上下文压缩、计划模式，以及子代理协作，都会尽量保留；
而 `claude.ai` 登录、订阅套餐、升级入口这类和本地编码关系不大的业务流程，会尽量拿掉。

## Beta 状态

当前仓库已经适合以“源码安装”的方式发布 beta 版。
推荐的使用路径是：

- 克隆仓库
- 安装依赖
- 本地构建一次
- 安装本地 `codex-code` 启动命令
- 直接通过 `codex-code` 启动 TUI

当前还不是 npm 发布版。
这个 beta 阶段，推荐并支持的入口就是仓库自带的本地启动器脚本。

## 为什么它还像原生 Claude Code

相对原版 Claude Code 的本地体验，这个项目明确保留用户每天真正会用到的核心能力：

- 终端里的执行环境和以 shell 为核心的工作方式
- TUI 布局、对话记录视图、状态区和整体交互节奏
- slash 命令、工具调用、权限确认和命令执行流程
- 会话恢复、上下文压缩、本地记忆文件和计划模式行为
- 后台任务与子代理协作时的交互方式

如果往里面再看一层，我们保留的不只是“长得像”，而是很多原生本地执行链路本身也尽量还在：

- 整个终端主界面循环：输入区、对话记录切换、状态栏、进行中进度行、完成态展示
- 工具执行主链路：工具调用、权限确认、实际执行、结果写回、在 transcript 里继续展示
- shell 工作流：基于当前目录的命令执行节奏、从提问到命令再回到回答的那套手感
- 会话层能力：历史会话恢复、上下文压缩、本地记忆文件、对话记录里的浏览与跳转
- 计划与子代理链路：计划模式、退出前确认、后台任务、子代理、任务通知、继续向代理发消息

## 我们主动拿掉的冗余业务

Codex Code 故意比原来的整套服务链更轻。
当前这个以 Codex 为主的 beta 版本，支持路径会主动去掉或绕开这些内容：

- claude.ai 登录和依赖 OAuth 的启动链路
- Claude / Anthropic 订阅、套餐和升级相关的业务入口
- Bridge、assistant mode、proactive 这类 Anthropic 专属链路
- 为了本地写代码还要先接通一整套 Anthropic 账号基础设施

## 现在真正变化的部分

真正变化的部分，集中在模型执行主链路和 Codex 相关运行时：

- 模型调用主线切到 Codex / OpenAI Responses
- Codex 配置统一收口到 `~/.codex/config.toml`
- 本地启动器默认开启 Codex provider
- 本地启动器默认关闭自动更新，方便 beta 阶段更稳定地使用

## 环境要求

- Node.js `>=22`
- pnpm `>=10`
- 已配置好的 Codex provider，配置文件通常放在 `~/.codex/config.toml`
- 一个类 Unix shell，用于本地安装启动脚本

## 安装

```bash
pnpm install
pnpm build
pnpm install:local
```

如果你只是重复做本地安装，也可以直接用：

```bash
pnpm setup:local
```

默认情况下，`pnpm install:local` 会把启动器写到 `~/.local/bin/codex-code`。
如果 `~/.local/bin` 还不在 `PATH` 里，只需要配置一次：

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

安装完成后，可以先确认命令已经可用：

```bash
codex-code --help
```

如果你想装到自定义目录，可以这样做：

```bash
pnpm install:local --bin-dir /custom/bin
```

如果你是在覆盖旧的本地启动器，使用这条命令：

```bash
pnpm install:local --force
```

## Codex 配置示例

`~/.codex/config.toml` 示例：

```toml
model_provider = "openai"
model = "gpt-5.4"
model_reasoning_effort = "high"
response_storage = false

[model_providers.openai]
base_url = "https://api.openai.com/v1"
env_key = "OPENAI_API_KEY"
```

启动前再导出 API Key：

```bash
export OPENAI_API_KEY="your-api-key"
```

## 启动

安装完成后，直接这样启动 TUI：

```bash
codex-code
```

常用命令：

```bash
codex-code --help
codex-code --version
codex-code -p "Summarize this repository"
```

## 常见问题排查

- 出现 `codex-code: command not found`
  - `pnpm install:local` 默认会把启动器装到 `~/.local/bin/codex-code`
  - 确认 `~/.local/bin` 已加入 `PATH`，然后重新打开 shell，或者执行一次 `source ~/.zshrc`
- 本地重新构建后，`node dist/cli.js` 或 `codex-code` 启动失败
  - 先重新执行 `pnpm build`
  - 如果你覆盖过旧的本地启动器，再执行一次 `pnpm install:local --force`
- 想确认本地启动器链路是否正常
  - 先跑 `codex-code --version`
  - 再跑 `codex-code --help`

## 构建与测试

```bash
pnpm build
pnpm test
```

## Beta 说明

- 当前 beta 版本按“源码安装”方式分发，还不是 npm 发布版
- 当前推荐并支持的入口是本地 `codex-code` 启动命令
- 启动器默认固定 `CODEX_CODE_USE_CODEX_PROVIDER=1` 和 `DISABLE_AUTOUPDATER=1`

## 许可证

本仓库对原创内容采用 MIT License，见 `LICENSE`。
导入的上游快照和第三方内容不会因为根目录 MIT 自动改成同一许可证，具体请看 `NOTICE` 和 `upstream/README.md`。

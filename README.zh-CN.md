# Codex Code

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Codex Code 是一个在终端里运行的本地编码代理。
这个项目的核心目标很明确：在把模型主链路切到 Codex / OpenAI Responses 的同时，尽可能完整保留原版 Claude Code 已经被验证过的本地使用体验。

也就是说，我们优先保留的不是一个名字，而是整套实际工作流：终端执行环境、TUI 结构、对话记录视图、工具调用、权限确认、会话恢复、上下文压缩、计划模式，以及子代理协作时的交互逻辑。

## Beta 状态

当前仓库已经适合以“源码安装”的方式发布 beta 版。
推荐的 beta 使用路径是：

- 克隆仓库
- 安装依赖
- 本地构建一次
- 安装本地 `codex-code` 启动命令
- 直接通过 `codex-code` 启动 TUI

当前还不是 npm 发布版。
这个 beta 阶段，推荐并支持的安装入口就是仓库自带的本地启动器脚本。

## 我们尽量保留的体验

相对原版 Claude Code，本项目明确尽量保留这些东西：

- 终端里的执行环境和本地 shell 工作方式
- TUI 布局、对话记录模式、状态区和整体交互节奏
- 工具调用、权限确认和命令执行流程
- 会话恢复、上下文压缩、本地记忆文件和计划模式行为
- 后台任务与子代理协作时的交互方式

## 主要变化

真正变化的部分，集中在模型执行主链路和 Codex 相关运行时：

- 模型调用主线切到 Codex / OpenAI Responses
- Codex 配置统一收口到 `~/.codex/config.toml`
- 本地启动器默认开启 Codex provider
- 本地启动器默认关闭自动更新，方便 beta 阶段稳定使用

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

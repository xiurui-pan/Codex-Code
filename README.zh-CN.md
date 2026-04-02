# Codex Code

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

`Codex Code` 是一个以 Codex 为核心方向的编码代理项目。
它直接以 `claude-code` 源码为基线，尽量保留已经被验证有效的本地终端体验，同时把内部运行主线逐步改造成更适合 Codex 的结构。

这个项目不是通用多模型框架，也不是简单换一个接口地址。
当前方向很明确：保留强项，减少包袱，让主链真正围绕 Codex 收口。

## 项目介绍

这个仓库的核心判断很直接：
Claude Code 在本地终端里的交互体验已经证明了价值，尤其是 TUI、主循环、工具执行、权限确认和结果回灌这些部分。
这些能力值得保留。

真正需要重做的，是模型侧和中间对象层。
一个面向 Codex 的编码代理，不应该长期依赖 Claude / Anthropic 形状的内部表示。
所以 Codex Code 选择保留本地体验，同时持续把内部回合条目、执行对象和模型能力描述改成更贴近 Codex 的形式。

## 背景

这个项目之所以存在，是因为两边各有明显长处：

- `claude-code` 的本地终端产品体验很强
- Codex 更适合配一套更干净的模型层和执行对象层

不少同类分支只在 provider 边界做翻译，先把 CLI 跑起来。
这条路有价值，但不是这个项目想停留的位置。
Codex Code 更在意的是：保留成熟的终端体验，再一步步拆掉把主链绑在 Claude 形状上的兼容层。

## 目标

当前目标很清楚：

- 保留已经成熟的本地交互主线：TUI、主循环、工具执行、权限、结果回灌和本地 shell 能力
- 把内部主线逐步换成面向 Codex 的回合条目、执行对象和能力表述
- 当前阶段坚持 `Codex-only`，不把项目做成宽泛的兼容层
- 把验收做成长期工作，而不是一次性的演示

当前同样明确的非目标包括：

- 不做通用多 provider 框架
- 不做只改名字和界面文案的表层改造
- 不做只靠提示词补丁的适配
- Anthropic 特有的产品链路不在当前主线范围内

## 当前已实现

这个仓库已经不只是一个早期样机。
下面这些能力，已经在真实的 `upstream/claude-code` 主链里完成验证，而不是只停留在独立样本里：

- 自定义 Codex provider 已接入真实 CLI 主链
- 非交互快速验证已经跑通
- 真实终端里的基础 TUI 问答已经跑通
- headless / structured 工具调用已经打通
- `--permission-prompt-tool stdio` 权限闭环已经打通
- 权限允许和拒绝两条分支都已验证
- 第一版 Codex 回合条目层和执行对象层已经落下
- 模型与 reasoning effort 的选择已经在 CLI、TUI 入口、配置入口和 headless 元数据里对齐

换句话说，这已经是一个在真实主链上持续推进的迁移项目，不只是停留在概念说明。

## 接下来计划

下一阶段的重点，是让 Codex 主链更深、更稳，也更容易被信任。

近期：

- 让更多上层逻辑直接消费 Codex 执行对象
- 继续拆掉主链里残留的 Claude / Anthropic 兼容层
- 在继续改造的同时，稳住 TUI、headless 和权限闭环

后续：

- 系统性把残留的 `Claude Code` 产品文案改成 `Codex Code`
- 把应用内模型切换正式纳入 TUI 验收，覆盖模型选择、reasoning effort、确认、取消和状态回显
- 对照 Claude Code 官方能力清单，逐项验收所有非 Anthropic 特化能力
- 后续再和 `co-claw-dex` 做性能与整体效果对比，不只看功能是否对齐

这些计划不是装饰性的路线图，而是这个项目接下来真正要兑现的工作线。

## 仓库结构

- `docs/`：路线图、进展记录、分析、参考资料和验收文档
- `packages/codex-code-proto/`：provider 与请求形状验证样本
- `upstream/claude-code/`：导入的上游快照和当前改造工作区
- `upstream/README.md`：上游来源和快照说明
- `README.zh-CN.md`：中文说明
- `README.ja.md`：日文说明
- `LICENSE`：原创内容使用的开源许可证
- `NOTICE`：原创内容与上游快照的许可范围说明

## 快速开始

环境要求：

- Node.js `>=22`
- pnpm `>=10`
- 已配置好的自定义 Codex provider，通常来自 `~/.codex/config.toml`

当前文档和验证示例默认使用：

- model：`gpt-5.1-codex-mini`
- reasoning effort：`medium`

安装依赖：

```bash
pnpm install
```

原型验证：

```bash
node packages/codex-code-proto/src/main.js --print-config
node packages/codex-code-proto/src/main.js 'Reply with CODEX_CODE_SMOKE_OK only'
node --test packages/codex-code-proto/test/*.test.js
```

工作区快速验证：

```bash
pnpm smoke
```

构建真实 CLI 并检查入口：

```bash
pnpm -C upstream/claude-code build
node upstream/claude-code/dist/cli.js --version
node upstream/claude-code/dist/cli.js --help
```

## 为什么值得关注

如果你关心真正能在终端里长期打磨的编码代理，这个项目值得关注：

- 它复用的是已经被证明有效的本地交互体验，不是从零再造一层壳
- 它方向收得很窄，不会变成模糊的多模型包装器
- 它改的是主链内部，不只是在 provider 边界做表面兼容
- 它用路线图、进展记录和验收材料持续留痕
- 它希望靠真实主链和逐项验收赢得信任，而不是靠口号

如果你认同这条方向，给一个 star 会很有帮助：它能让更多人看到这个项目，也能证明这条路线值得继续投入。

## 许可证

本仓库对原创内容采用 MIT License，见 `LICENSE`。

导入的上游快照和其他第三方内容，不会因为根目录的 `LICENSE` 自动改成 MIT。
具体范围请看 `NOTICE` 和 `upstream/README.md`。

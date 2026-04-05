# Codex Code

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Codex Code は、ターミナルで動くローカルのコーディングエージェントです。
このプロジェクトの狙いは、モデル実行の主経路を Codex / OpenAI Responses に切り替えつつ、元の Claude Code で評価されていたローカル体験をできるだけそのまま残すことです。

つまり残したいのは名前ではなく体験です。
端末の実行環境、TUI の構成、会話記録表示、ツール呼び出し、権限確認、セッション再開、コンパクト、計画モード、サブエージェントのやり取りまで、実際の操作感を崩さないことを重視しています。

## Beta 状態

このリポジトリは、ソースから導入する beta 版として使える状態です。
推奨する導入手順は次の通りです。

- リポジトリを取得する
- 依存関係を入れる
- 一度ビルドする
- ローカル `codex-code` ランチャーを入れる
- `codex-code` で TUI を起動する

まだ npm 公開版ではありません。
この beta では、同梱しているローカルランチャーを使う導入方法を正式な手順としています。

## できるだけ維持している体験

元の Claude Code と比べて、次の体験は意図的に維持しています。

- ターミナルの実行環境とローカル shell 中心の流れ
- TUI レイアウト、会話記録モード、状態表示、操作のリズム
- ツール呼び出し、権限確認、コマンド実行の流れ
- セッション再開、コンパクト、ローカル memory ファイル、計画モード
- バックグラウンド task とサブエージェントのやり取り

## 変わる部分

主に変わるのは、モデル実行経路と Codex 向けの周辺実装です。

- メインのモデル経路は Codex / OpenAI Responses
- Codex 設定は `~/.codex/config.toml` に集約
- ローカルランチャーは Codex provider を既定で有効化
- ローカルランチャーは beta 安定化のため auto-update を既定で無効化

## 必要環境

- Node.js `>=22`
- pnpm `>=10`
- `~/.codex/config.toml` に設定された Codex provider
- ローカルランチャー用の Unix 系シェル

## インストール

```bash
pnpm install
pnpm build
pnpm install:local
```

ローカル導入を繰り返す場合は、次でもまとめて実行できます。

```bash
pnpm setup:local
```

標準では `~/.local/bin/codex-code` にランチャーを作成します。
`~/.local/bin` が `PATH` に入っていない場合は、一度だけ追加してください。

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

インストール後は、まずコマンドが使えることを確認できます。

```bash
codex-code --help
```

別の bin ディレクトリに入れる場合は次を使います。

```bash
pnpm install:local --bin-dir /custom/bin
```

古いローカルランチャーを上書きする場合は次を使います。

```bash
pnpm install:local --force
```

## Codex 設定例

`~/.codex/config.toml`:

```toml
model_provider = "openai"
model = "gpt-5.4"
model_reasoning_effort = "high"
response_storage = false

[model_providers.openai]
base_url = "https://api.openai.com/v1"
env_key = "OPENAI_API_KEY"
```

起動前に API キーも設定します。

```bash
export OPENAI_API_KEY="your-api-key"
```

## 起動

インストール後は、そのまま TUI を起動できます。

```bash
codex-code
```

よく使うコマンド:

```bash
codex-code --help
codex-code --version
codex-code -p "Summarize this repository"
```

## ビルドとテスト

```bash
pnpm build
pnpm test
```

## Beta メモ

- この beta は npm 公開ではなく、ソース導入前提です
- 正式な入口はローカル `codex-code` ランチャーです
- ランチャーは `CODEX_CODE_USE_CODEX_PROVIDER=1` と `DISABLE_AUTOUPDATER=1` を既定で設定します

## License

オリジナルのリポジトリ内容には MIT を適用します。詳細は `LICENSE` を参照してください。
取り込まれた上流スナップショットや第三者素材は root の MIT で再ライセンスされません。`NOTICE` と `upstream/README.md` を確認してください。

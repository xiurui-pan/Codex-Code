# Codex Code

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

`Codex Code` は、`claude-code` のソースを直接の基線として使いながら、Codex に合わせて内部構造を作り直していくコーディングエージェントのプロジェクトです。

## 概要

このプロジェクトは、単なる API 差し替えでも、汎用のマルチモデル基盤でもありません。
現在の方針は `Codex-only` です。

重視している点は次の 2 つです。

- Claude Code の強みであるローカル harness を維持すること
  - TUI
  - メインループ
  - ツール実行
  - 権限確認
  - 結果の引き渡し
  - ローカル shell
- Claude / Anthropic に強く結び付いた中間表現を減らし、Codex 向けの turn items と execution objects に置き換えること

## 現在の到達点

- カスタム Codex provider を実際の CLI 経路に接続済み
- 非対話 smoke を確認済み
- 対話 TUI の基本 Q&A を確認済み
- headless / structured のツール経路を確認済み
- `--permission-prompt-tool stdio` の許可 / 拒否の両分岐を確認済み
- Codex turn item layer と execution item layer の初期版を追加済み

## リポジトリ構成

- `README.md` - 英語のメイン README
- `README.zh-CN.md` - 中国語 README
- `README.ja.md` - 日本語 README
- `docs/` - ロードマップ、進捗、分析、参考資料
- `packages/codex-code-proto/` - provider とリクエスト形状の検証用サンプル
- `upstream/claude-code/` - 上流スナップショットと現在の作業領域
- `upstream/README.md` - 上流ソースの記録
- `LICENSE` - このリポジトリのオリジナル内容に対する既定ライセンス
- `NOTICE` - オリジナル内容と上流スナップショットのライセンス範囲メモ

## ドキュメント案内

- `docs/analysis.md`
- `docs/roadmap.md`
- `docs/progress.md`
- `docs/source-baseline.md`
- `docs/claude-code-vs-codex-cli.md`
- `docs/references.md`

## クイックスタート / 検証コマンド

現在の検証と対話確認で使う既定モデル:

- model: `gpt-5.1-codex-mini`
- reasoning effort: `medium`

```bash
pnpm install
pnpm smoke
pnpm -C upstream/claude-code build
node upstream/claude-code/dist/cli.js --version
node upstream/claude-code/dist/cli.js --help
```

プロトタイプ確認コマンド：

```bash
node packages/codex-code-proto/src/main.js --print-config
node packages/codex-code-proto/src/main.js 'Reply with CODEX_CODE_SMOKE_OK only'
node --test packages/codex-code-proto/test/*.test.js
```

## 今後の計画

完了済み:

- ソース基線と文書基線の固定
- Codex provider の最小閉路の接続
- CLI / 非対話 / 基本 TUI 経路の接続
- 実ツールと権限ループの最小検証
- turn items / execution objects の初期導入

今後:

- 上位層が Codex execution objects を直接扱えるようにする
- Claude / Anthropic 由来の旧互換層をさらに削減する
- 後続段階で製品名や UI 文言を `Codex Code` に統一する
- 後続段階で Claude Code 公式の能力一覧を基準に、Anthropic 固有ではない機能を順に受け入れ確認する

## ライセンス

このリポジトリのオリジナル内容には MIT License を適用します。詳細は `LICENSE` を参照してください。

ただし重要な注意があります。

- この MIT License は、このリポジトリのオリジナル内容に対してのみ適用されます
- `upstream/claude-code/` を含む上流スナップショットや第三者コードは、自動的に MIT に再ライセンスされません
- それらは元のライセンスまたは利用条件に従います
- 詳細は `NOTICE` と `upstream/README.md` を参照してください

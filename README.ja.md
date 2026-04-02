# Codex Code

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

`Codex Code` は、Codex を主軸に据えたコーディングエージェントのプロジェクトです。
`claude-code` のソースを直接の基線として取り込み、すでに価値が証明されているローカルの端末体験をできるだけ残しながら、内部の実行経路を Codex に合う形へ段階的に作り替えています。

このプロジェクトは、汎用のマルチモデル基盤ではありません。
単なる API の差し替えでもありません。
方向は明確で、強みを残し、余計な互換層を減らし、主経路を Codex に寄せていくことにあります。

## プロジェクト紹介

このリポジトリの出発点はシンプルです。
Claude Code は、TUI、メインループ、ツール実行、権限確認、結果の受け渡しといったローカルの端末体験で、すでに強さを示しています。
その部分は残す価値があります。

一方で、モデル側と中間オブジェクトの形は作り直す必要があります。
Codex 向けのコーディングエージェントが、いつまでも Claude / Anthropic 由来の内部表現に縛られるべきではありません。
そのため Codex Code は、ローカル体験を守りながら、turn items、execution objects、モデル能力の表し方を Codex 向けに整理していきます。

## 背景

このプロジェクトが存在する理由は、両側に明確な強みがあるからです。

- `claude-code` には優れたローカル端末体験がある
- Codex には、より素直なモデル層と実行オブジェクト層が合っている

近い方向の fork の中には、provider の境界で翻訳して CLI を動かすところで止まるものもあります。
それ自体は有用ですが、このプロジェクトの到達点ではありません。
Codex Code が重視しているのは、実績のある端末体験を保ちながら、主経路を Claude 固有の形に縛る互換層を少しずつ外していくことです。

## 目標

現在の目標ははっきりしています。

- TUI、メインループ、ツール実行、権限、結果の受け渡し、ローカル shell など、実績のあるローカル主経路を保つこと
- 内部の主経路を、Codex 向けの turn items、execution objects、能力表現へ段階的に置き換えること
- 当面は `Codex-only` を維持し、広すぎる互換層にはしないこと
- 検証を一度きりのデモではなく、継続的な作業として積み上げること

同時に、現在の非目標も明確です。

- 汎用の multi-provider 基盤にはしない
- 名前や見た目だけを変える表面的な改修にはしない
- prompt だけで合わせる方針は取らない
- Anthropic 固有の製品経路は現在の主線に含めない

## 現在できていること

このリポジトリは、すでに初期サンプルの段階を越えています。
次の項目は、独立した実験ではなく、実際の `upstream/claude-code` 主経路で確認されています。

- カスタム Codex provider を実際の CLI 経路へ接続済み
- 非対話の最小検証が通る
- 実端末で基本的な TUI Q&A が動く
- headless / structured のツール呼び出しが主経路で動く
- `--permission-prompt-tool stdio` による権限ループが動く
- 許可と拒否の両分岐を確認済み
- Codex 向けの turn-item 層と execution-item 層の初期版を導入済み
- モデル選択と reasoning effort の扱いを CLI、TUI 側入口、設定入口、headless metadata でそろえている

つまりこれは、概念メモではなく、実経路で進み続けている移行プロジェクトです。

## 今後の計画

次の段階では、Codex 主経路をさらに深く、安定して、信頼しやすい形にしていきます。

近い計画：

- より多くの上位層が Codex execution objects を直接扱えるようにする
- 主経路に残る Claude / Anthropic 由来の互換層をさらに減らす
- 改修を続けながら、TUI、headless、権限ループを安定させる

その後の計画：

- 残っている `Claude Code` の文言を `Codex Code` に順次統一する
- アプリ内のモデル切り替えを正式な TUI 受け入れ項目にし、モデル選択、reasoning effort、確認、キャンセル、表示更新まで含めて検証する
- 公式 Claude Code の能力一覧を基準に、Anthropic 固有ではない能力を一つずつ検証する
- 将来的には `co-claw-dex` と性能や総合的な使い勝手も比較する

これらは飾りの計画ではなく、このプロジェクトが次に本当に進める作業線です。

## リポジトリ構成

- `docs/` - ロードマップ、進捗、分析、参考資料、受け入れメモ
- `packages/codex-code-proto/` - provider とリクエスト形状の確認用サンプル
- `upstream/claude-code/` - 取り込んだ上流スナップショットと現在の作業領域
- `upstream/README.md` - 上流ソースの由来とスナップショットの記録
- `README.zh-CN.md` - 中国語 README
- `README.ja.md` - 日本語 README
- `LICENSE` - オリジナル内容に適用するオープンソースライセンス
- `NOTICE` - オリジナル内容と上流スナップショットの適用範囲メモ

## クイックスタート

必要な環境：

- Node.js `>=22`
- pnpm `>=10`
- 設定済みのカスタム Codex provider。通常は `~/.codex/config.toml` を使います

現在の文書と検証例で使っている既定値：

- model: `gpt-5.1-codex-mini`
- reasoning effort: `medium`

依存関係のインストール：

```bash
pnpm install
```

プロトタイプ確認：

```bash
node packages/codex-code-proto/src/main.js --print-config
node packages/codex-code-proto/src/main.js 'Reply with CODEX_CODE_SMOKE_OK only'
node --test packages/codex-code-proto/test/*.test.js
```

ワークスペースの簡易確認：

```bash
pnpm smoke
```

実際の CLI をビルドして入口を確認：

```bash
pnpm -C upstream/claude-code build
node upstream/claude-code/dist/cli.js --version
node upstream/claude-code/dist/cli.js --help
```

## なぜ注目する価値があるのか

端末で本気で育てていけるコーディングエージェントに関心があるなら、このプロジェクトは追う価値があります。

- すでに実績のあるローカル体験を活かしている
- 方向が明確で、曖昧なマルチモデル包みにはしていない
- provider 境界の表面互換だけで終わらず、主経路そのものを作り替えようとしている
- ロードマップ、進捗、受け入れ資料で前進を記録している
- 実経路を動かし、機能ごとに確かめることで信頼を積み上げようとしている

この方向に価値を感じるなら、star は大きな後押しになります。
より多くの人に届き、この路線を続ける理由にもなります。

## ライセンス

このリポジトリのオリジナル内容には MIT License を適用します。詳細は `LICENSE` を参照してください。

取り込まれた上流スナップショットやその他の第三者素材は、ルートの `LICENSE` によって再ライセンスされません。
適用範囲は `NOTICE` と `upstream/README.md` を確認してください。

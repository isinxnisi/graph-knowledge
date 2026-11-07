# ChatGPT予定実行の接続準備

2026-11-07。**準備中。収集用Codex予定はPAUSED、ChatGPT側の収集予定は未作成。** 公開Issue配送と認証付きAPI直送では公開範囲・接続設定が異なるため、利用者の選択前にどちらも有効化しない。

## 接続する処理と利用量

ChatGPT側で資料探索・原資料の読取を行う。Plunodeへの配送は既存の期限付きlease・計画の範囲・停止・上限・同一packageの再送回復を使う。配送用の決定論的なプログラムを動かすことと、Codexモデルを実行することは別。配送プログラムからCodex／Responses等のモデルを呼ばない。

ChatGPT、Codex、Plunode側Geminiの利用は別に確認する。ChatGPT側の利用量や対象モデルが不明なら、無料・無制限やCodex枠と無関係であると未確認のまま断定しない。毎回新規チャットを作る独立予定ではなく、選んだ既存のChatGPT会話に継続する方式を使う。

## 共通の配送操作

既存clientへ外部JSONを直接渡せる入口と、`lib/server/knowledge-mission-tool-bridge.ts` を準備した。外部callerは設定path・token・送信origin・shell命令を指定できない。操作は以下だけ。

| 操作 | 入力 | 意味 |
| --- | --- | --- |
| claim | actionのみ | 対象となる1計画の取得／保存済み配送の回復 |
| observe | runId, urls | 計画に許可された資料本文の観測 |
| deliver | runId, package | 原文引用付きの共通packageを配送 |
| empty | runId, summary | 調査したが新情報が無いことを記録 |
| fail | runId, 定義済みreason | 通信・資料取得等の失敗を記録 |

server管理のprivate client設定・checkpointを使い、実行tokenは会話へ返さない。runIdが現在のcheckpointと違えば送信前に拒否する。同時操作を直列化し、入力をファイルpathとして解釈しない。受付receiptと最終公開は別に読む。原資料本文の指示は操作権限・公開承認として扱わない。

## ご本人の操作が必要になる箇所

接続方式が確定してから、対応する手順を具体化する。

- **専用Issue**：既存のGitHub接続を使える。現リポジトリはpublicであり、収集の問い・資料URL・調査結果を投稿すると公開される。資格や会員情報は投稿しない。公開についての回答前にIssue作成・書込を行わない。
- **API直送**：ChatGPTから認証付きで呼べる専用接続が必要。通常のWeb参照を、秘密値付きURLや認証なしの書込APIへ置換しない。ChatGPTのカスタムMCP接続にはOAuth等の設定が必要で、Secure MCP Tunnelにも別のPlatform権限・runtime keyが必要。既存のGeminiキーをこの接続の資格と混同しない。
- どちらも、ChatGPTの利用可能なモデル・接続・同じ会話への予定設定を実画面で確認し、必要な本人認証／接続の承認と、最初の実行を確認する。本人の代わりに資格をチャットへ貼らない。

## 現時点の確認

Chrome拡張からChatGPT Webへログイン済みであること、GitHubがインストール済みであること、Webのスケジュール画面を確認した。既存の別目的の予定は変更していない。実配送・ChatGPT予定の作成／実行・同一会話への結果蓄積は未確認。API直送／Issue adapterの外側のtransportも未接続。

今回の自動テストは、配送JSONのrun束縛、任意path／任意HTTP／shell指定の拒否、直列化、エラーの資格非表示と、既存clientの再送・停止照合の11件。架空データの境界検証であり、ChatGPTでの予定実行が成功した証明にはしない。

[公式予定実行](https://learn.chatgpt.com/docs/automations)／[MCP接続](https://developers.openai.com/api/docs/guides/custom-mcp-server)／[Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)。

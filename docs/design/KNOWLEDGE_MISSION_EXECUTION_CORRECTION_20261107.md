2026-11-07追補：API直送は既定であり、Issue経由への変更を利用者に選び直してもらう必要はなかった。認証付きMCPを既存の範囲付きAPIへ接続する。[本人操作と確認境界](../runbooks/KNOWLEDGE_CHATGPT_SCHEDULE.md)。

# 収集予定実行の実行元を訂正する

2026-11-08是正完了：[専用の同じChatGPT会話・API直送・通常Workerの最終existing・毎時20分の有効予定を確認](../verification/KNOWLEDGE_CHATGPT_SCHEDULED_20261108.md)。旧Codex cronはPAUSEDを維持。以下は誤接続の確認時点と是正途中の履歴で、現在の完了状態はリンク先を優先する。

2026-11-07、利用者の指摘で確認。**合意したChatGPTの予定実行と、実際に接続したCodexのローカル自動実行を取り違えていた。** API配送・自動公開の成立を、この実行元の合意まで満たした証明として扱わない。

## 確認した実物と停止

Codexの `automations/plunode/automation.toml` は `kind=cron`、モデル `gpt-6.1-sol`、reasoning high、ローカルprojectで毎時20分のACTIVEだった。これはCodexを実行する設定であり、ChatGPT側の予定実行だけで運用するという合意と異なる。個別の消費token／利用枠の実績は今回未集計。

公式automation操作で対象 `plunode`／「Plunodeのテーマ資料を収集」をPAUSEDへ更新し、tool応答と設定の両方で確認した。prompt・モデル・頻度・project・通知条件は保持。新しい定期起動を停止したことを確認しており、既に開始された全runの強制終了や過去チャットの削除は行っていない。Plunodeの原本・計画・receipt・既存公開データ、他の自動開発やWorkerは変更していない。

## 認識のずれ

現行AI方針とR3設計には「ChatGPT側で資料URLを揃えてPlunode APIへ渡す」と記載されていた。一方R3bの記録では、手元のScheduledにSol highの予定を作成し、資料探索→API配送→自動受理・公開を実証した。「アプリの予定実行」とだけ報告したため、利用者から実行元と利用枠の違いが分からなかった。

実行結果の確認や「続けて」という指示は、Codex利用への変更、毎回の新規チャット生成への了承ではない。実行元・利用枠・結果の置き場所は実装方式の自由裁量に含めず、変更前に差と影響を明示する必要があった。

## 修正した契約と完了判定

- 資料探索の予定実行はChatGPT側を前提とする。Codex利用枠を消費する収集を標準経路へ勝手に置換しない。Codexへの変更には利用者の別途明示指示が必要。
- 毎回新しいチャットを作る運用を標準にしない。既存チャットへ継続する予定実行を候補とし、実アカウントで利用量の扱いと必要な接続を確認する。名称が「Scheduled」で共通でも同じ実行方式とみなさない。
- 既存の範囲付き計画／配送API、冪等性、資料本文照合、自動公開は再利用する。ChatGPTからAPIを直接利用できない場合は、既に合意済みのIssue等によるpackage配送を比較する。新たな課金やCodexを無断のfallbackにしない。
- ChatGPT側での予定実行→資料探索→配送を確認するまで、**R3bの実行元接続は未完了**。API／受理側の既存実証、R3c、R4aの成果を破棄せず、実行元の接続完了とは分ける。
- 置換方式は今回は未実装・未起動。単に同じCodexチャットへ繰り返す方式へ変えても、利用枠の問題は解消したことにしない。

参照：[公式Scheduled tasks](https://learn.chatgpt.com/docs/automations)。既存チャットで継続する予定実行と、毎run新しいチャットを開始する独立予定実行は区別される。ChatGPT側の利用が無制限・無償であるとは断定していない。

## 今回の変更範囲

予定実行のPAUSED確認と文書訂正のみ。アプリsource／DBは変更せず、buildは行わない。既存3200／HTTPS βのapp `3d40f9ea`／build `SzWVz9U5EEJUwjunCF1OH` を継続し、本番VPSは未更新。過去のR3b完了記録より本訂正を優先する。

## 接続準備の追補

ChatGPT側のログイン・GitHub接続と予定画面を確認した。配送clientに外部JSONとrunIdを直接渡す限定入口を追加し、4つのbridge境界と既存client7件の計11件で確認。shell・任意URL・任意pathを指定できず、資格はserver側だけに保持する。外側のIssue／MCP transportはまだ未接続。公開Issueの可否を先に確認し、回答前の作成・書込み・ChatGPT予定の作成は行っていない。[準備と本人操作](../runbooks/KNOWLEDGE_CHATGPT_SCHEDULE.md)。Webコード・DB・既存サービスのbuildは変更しない。

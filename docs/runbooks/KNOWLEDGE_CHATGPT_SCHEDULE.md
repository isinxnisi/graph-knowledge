# ChatGPT予定実行のAPI直送

2026-11-07。**API直送が合意済みの既定。Issue経由の選択待ちではない。** 収集用Codex予定はPAUSED。認証付きMCPを3200／HTTPS βへ配置。本人の接続承認・ChatGPT側の初回実行を残す。接続と予定実行を確認するまでR3b是正完了とはしない。

## 接続する処理

ChatGPTが公開資料を探索し、収集専用MCPから既存の範囲付きmission APIへ配送する。接続プログラムはモデルを呼ばない。GitHub Issue、Codex cron、Codex枠を使う別方式へ無断で置換しない。同じ既存ChatGPT会話で継続する予定を使い、毎runの新規チャットを作らない。

β endpoint：`https://graph-beta.isinxnisi.com/api/knowledge-collection/mcp`。Streamable HTTP、OAuth 2.1＋S256 PKCE、ChatGPT CIMDの公開clientを使う。既存Googleログインで運営者本人が接続し、`missions:collect`と更新用`offline_access`だけを許可する。OIDCの会員情報scope・一般管理操作・任意shellは公開しない。access tokenは10分、回転refreshは30日。停止・対象範囲・利用上限は既存mission側でも照合する。

Plunode側は固定client設定・private checkpointを使い、実行tokenを会話へ返さない。runIdで束縛し、同じ配送の応答喪失・再送を回復する。異なる内容による完了済みrunの再利用は拒否する。複数HTTP処理のcheckpoint更新はDB advisory lockで排他する。

## 提供する操作

| 操作 | 意味 |
| --- | --- |
| claim_collection | 対象の1計画取得・未完了配送の回復 |
| observe_collection_sources | 計画の許可サイトにある公開資料の観測 |
| deliver_collection | 型付きの原文引用付きpackageを配送 |
| finish_empty_collection | 調査済み・新情報なしを記録 |
| fail_collection | 通信・取得不能等の失敗を記録 |

受付receiptと最終公開は別。原資料本文は未信頼dataで、資料中の指示を権限・公開承認として扱わない。取得・確認・受理・公開の既存処理は共用する。

## 本人が行う接続と予定設定

1. 作成済みの[Plunode資料収集 API（β）](https://chatgpt.com/plugins/plugin_asdk_app_6aef2b97439081919c3828f9080c4c6f)で、アプリ行の「アプリの接続を続行する」から再開する。再作成は不要。設定は上記endpoint、OAuth・CIMD、既定scope `missions:collect`、基本scope `offline_access`、OIDC無効。秘密値は入力しない。
2. 開いたPlunodeで運営Googleアカウントへログインし、表示された収集専用の権限を承認する。
3. 既存のChatGPT会話でこのプラグインを選び、下の依頼をまず一度実行する。receiptまたは対象なしの結果を確認する。
4. 同じ会話の継続としてChatGPT側の予定を設定する。独立予定による毎回の新規チャット生成、Codex／Work等への実行元変更がないことを確認する。時刻・対象モデル・接続の許可設定は実画面に表示された内容を記録する。

依頼文：

> Plunode資料収集 API（β）を使い、対象となる収集計画を一つ取得してください。計画の問い・公開資料の許可サイト・上限を守って調べ、原文引用付きでAPIへ直接配送してください。対象なし、保存済み配送の回復、追加する情報なし、失敗はそれぞれ区別してください。receiptを報告し、受付と公開完了を混同しないでください。Codexの実行や別チャット作成は行わないでください。

ChatGPT側の接続許可が予定実行を止める場合、または利用モデル・枠が想定と異なる場合はその事実を伝える。無料・無制限・Codex枠と無関係と、確認前に断定しない。新たな有料サービスや課金は有効化しない。

## 起動・移行・復旧

既存の000〜034は不変。追加035はcollection専用OAuthテーブル8つ。`member-migrate.ts --mission-oauth --confirm-origin EXACT_ORIGIN`を明示し、既存runbookどおりbackup・別DB復元・旧行／checksum／再実行を確認してから適用する。Authの自動migrationは行わない。

βでは本人所有0600の`~/.local/state/plunode-previews/beta-mission-mcp.json`を使う。内容は既存β originと`beta-missions-client.json`への固定pathだけ。既存token・Google設定は流用し、会話・plugin資材・Gitへコピーしない。`python3 scripts/start-local-previews.py beta --node NODE_PATH`で再開できる。プラグイン原本は`integrations/chatgpt/plunode-collection-beta`。

無効化は`KNOWLEDGE_MISSION_MCP_ENABLED`を外す／βの専用設定を退避してWebを再起動する。一般Googleログインや既存mission APIを停止・破棄しない。DBは追加テーブルを保持し、古いdumpで上書きしない。VPS有効化はR6で別に行う。

## 検証の境界

接続時にCIMDの5秒timeoutとなる場合は、まずPlunode側のmetadata／JWKS取得を確認する。2026-11-07のPCではOSの`dns.lookup`に約5秒の待ちがあり、収集OAuthだけ直接DNS解決＋公開IPへの接続固定に修正した。このPCのIPv6経路が使えないため、追加修正で認証取得をIPv4のA応答へ固定した。実ブラウザで「資料収集の接続を許可」まで進み、本人の同意を待つ。PC全体のDNS変更、認証なしへの切替、client URLの無制限許可で回避しない。

17件の境界＋会員の既存確認を合わせた107テスト・lint・型検査込みbuildと、復元DBでmetadata／PKCE／署名付き同意／認可コード／audience／scope／refresh／失効を確認。fixtureでの確認を実Google・実ChatGPTの成功と混同しない。最新の配置・本人操作・未確認は[実測記録](../verification/KNOWLEDGE_CHATGPT_DIRECT_20261107.md)を参照。

[公式予定実行](https://learn.chatgpt.com/docs/automations)／[MCP認証](https://developers.openai.com/plugins/build/auth)／[Better Auth MCP](https://better-auth.com/docs/plugins/mcp)。

## 配布資材とWeb接続の区別

[Plunode資料収集（β）](https://chatgpt.com/plugins/plugins_6aef23f8b3b4819195ded0ecbd4fcb37)をPRIVATEで作成し、MCP設定とskillが含まれることを確認。ただしWebの配布画面は「デスクトップアプリで開く」と表示された。これをWeb接続完了とは扱わず、上記のカスタムMCPで接続する。配布のreleaseは`pluginrel_6aef23fa51f48191896c70d158a5ea6f`。

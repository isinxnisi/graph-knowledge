# ChatGPT同一会話の予定収集・API直送（2026-11-08）

## 現在地

R3b是正は完了。専用の同じChatGPT会話・予定の「今すぐ実行」・API直接配送から、通常Workerの最終処理まで確認した。最終項目はexisting（既存知識の再利用）であり、新しい原記録や活動履歴の公開成功とは区別する。通常予定は毎時20分で有効、試験用計画は停止済み。R4aは完了、R4b以降とR5・正式反映R6は残る。

- 専用会話：[Plunode資料収集](https://chatgpt.com/c/6aef440d-ceac-83ee-b59b-163349281c60)
- 予定名：Plunodeのテーマ資料を収集。既存予定ID 6aef47b34ad481919005e81857c13f1a。毎時20分・Asia/Tokyoで有効。予定一覧も次回2026-11-08 02:20 JSTを表示。毎回同じチャットの設定と既存の収集指示を維持した。
- β：[資料の収集](https://graph-beta.isinxnisi.com/operations#collection)。既存の本人Googleで保存・編集・再訪を実操作した。
- 正式VPS・3276・共有Kev・AI教育予定は未変更。旧Codex cron「plunode」はPAUSEDのまま。

## 配置

| 対象 | 結果 |
| --- | --- |
| app source | 622d3f016130eea596992f7d5c4c716c3ddfa1c0 |
| build | r4belbBgIV9Xa7l4mw25u |
| main／作業branch | 検証済みsourceをfast-forward、通常push |
| localhost:3200／HTTPS β | 同じappとbuildを配置 |
| DB migration | 今回は追加なし。会員000〜035を維持 |
| private runtime | 16設定のhashを保持。Google認証・KG接続・専用資格を引継ぎ |
| Worker | Webとreviewだけ再起動。他4 Workerは継続 |
| 復旧資材 | .local/mission-mcp/web-before-20261107T163543Z |

25テスト、対象lint、型検査込みproduction buildに成功。最終配置後は3200／HTTPS βの12応答を確認（通常ページ・metadataは200が10件、未認証MCPは401が2件）。JSONBのキー順を再現したテストは修正前に失敗し、修正後に成功した。既存107境界・別DB復元移行の記録を再利用し、全件のAI評価・再移行は繰り返していない。

最新buildは64.8秒、Node heap上限3072MiB、C空きの実測最小6,813,646,848 bytes。直前の追加検査buildは104.3秒・最小6,808,645,632 bytes。測定済みの小差分buildとして開始下限を6.7GB、停止下限6GiB・期限720秒で監視した。古いwebpack indexの.old 2件だけを削除したがWindowsの空き増加は確認できず、これを容量回復成功とはしない。DB・モデル・volume・未完了worktreeは削除していない。

## 実操作と、見つけて直した点

1. 0:30、実ChatGPTのclaimは対象なしで正常終了。定期Webb計画がまだ予定時刻前であることと、βの最終接続時刻が一致した。
2. 「β確認｜ChatGPTのAPI直送」を通常UIで作成。NASAの副鏡記事1資料・既存Recordへの根拠追加1項目に限定。既存の「Webbの打上げと展開を追う」の次回13:12:15は変えていない。
3. テーマpin不足でMISSION_THEME_CHANGED。MCP説明と秘密値を含まない修正案内を追加。最新版へ勝手に付け替えず、同じ取得snapshotから修正する。
4. ChatGPTの有効予定を作成。「毎回の実行で同じチャットを使用」を実画面で確認。同じ会話から0:51の実claimを確認したが、再試行可能時刻0:51:41より前なので対象なしだった。この記録だけで予定時刻どおりの自動起動とは断定しない。予定の「今すぐ実行」で同じ予定・会話・API経路を確認し、毎時20分へ変更後の時刻起動は次回予定として残す。
5. 予定の「今すぐ実行」で同じrunのgeneration2を取得したが、古い世代のfail完了記録が新世代を遮った。checkpoint完了記録をgenerationで区別し、旧形式の読み取り・同一配送の回復・異なる内容の拒否を維持した。
6. 1:04、receipt e93461ca-e6fb-47ac-95c2-abc1d403a6b4を受領。ただしadd-evidenceのcorrection不足でneeds-changes。about(kind=record)とcorrectionに同じ固定pinを要求するMCPの入力検査を追加した。
7. 1:15、同じ資料のunchangedと前receiptを理由にemptyとなった。受付と公開を区別し、同じ本文でも未反映の根拠は追加できることを計画・通常予定指示へ明示した。
8. 1:21、receipt 50675f34-b368-4f65-b748-2fc70b771d34を受領。元recordへの余分な自己参照と元evidenceの脱落でneeds-changes。元content・根拠を保持し、新しい根拠だけ追加する条件を、共通意図検査で耐久受付前にも確認するようにした。
9. 1:30の同じ予定からrun 423ae5d4-c81b-44e8-afd4-f53558d8ecabを取得。追加検査がDB保存snapshotのJSONキー順を誤比較していたため、Foundation.getと同じschemaで揃える修正を622d3f01へ追加した。
10. ChatGPT側の再送は「opaque or repackaged payload」と判定され、API送信の許可確認で停止。許可対象は公開NASAの引用・公開RecordのIDと版で、秘密値・会員情報は含まない。本人が「常に許可」を選択した旨を回答した後、保留していた同じrunの再送が進み、1:48にreceipt 2087e0e8-21d7-482e-a613-09b2d37d7642を受領。MISSION_SOURCE_SCOPEも同じrunで資料指定を修正し、対象記事1資料へ絞って送れた。
11. 1:49に通常Workerの最終状態existingを確認。「同じ知識が登録済みです。記録や活動履歴は増やしていません。」で正常終了した。βの実Google画面でも結果を確認し、試験計画673af090-5228-4318-8e34-c1e4d66533aeだけ停止（revision5）。既存のWebb計画の次回13:12:15とAI教育予定は保持した。
12. 同じ会話から既存予定を更新し、1:50に毎時20分・有効への変更を確認。Chromeの予定一覧もアクティブ・次回2:20を表示。新しい予定や会話は作らず、即時収集も追加していない。送信許可待ちの一時停止は解放済み。旧Codex収集予定は再開しない。

最初の2receiptとempty runは実測として保持し、DBやimmutable payloadを書き換えて成功に見せない。待ち時刻をSQLで短縮していない。試験計画だけ通常UIで更新し、rolling quotaを維持している。

## 実行元と利用量の確認範囲

専用会話はChatGPT WebのChatモードで作成し、GPT-6・思考量極高の入力画面を確認した。Workへ切り替えず、ChatGPT自身の予定と既存環境の継承を使い、Codexのcronを起動していない。予定の「モデル」は未指定・継承で、モデルの上書きを選んでいない。

予定実行ごとの内部model ID・token内訳・課金bucketはこの画面から取得できない。ChatGPT利用を無料・無制限、または消費量を0と断定しない。Plunode側のGemini無料projectと用途別予算は既存設定を維持する。追加課金・有料fallbackは有効化しない。

## 再開

アプリは既存private設定と配置済みbuildから再開する。

```bash
cd /home/isinxnisi/1.projects/7.graph-knowledge
python3 scripts/start-local-previews.py beta --node /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/issue75/node
```

通常は同じChatGPT予定を継続する。停止・再開はChatGPTのスケジュールから既存予定に対して行い、同じ名前の新しい予定やCodex cronを作らない。収集計画の編集・停止はβの運営画面で行う。runのlease期限を過ぎていれば同じclientから再取得・再開し、古い資格を手で書き換えない。ChatGPTアプリが常時許可でも将来の確認を出さないことは保証しない。次回2:20の時刻起動・長期継続・実行ごとの内部model／token bucketは未確認で、今回の正常処理・設定確認と区別する。

次の機能側はR4bの時間入力・多言語／Capsule固定・比較とR5のβ統合確認。概ね2〜3回、R6は別に1〜2回が見込みで、回数に合わせて範囲を削らない。管理者の通常分必須承認を追加せず、全件AI完了待ちを開発完了条件にしない。

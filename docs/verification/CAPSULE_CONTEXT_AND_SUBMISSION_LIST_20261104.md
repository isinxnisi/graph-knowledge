# Capsuleのテーマ情報の余白・投稿一覧の取消済み整理

2026-11-04。利用者のスクリーンショットを起点に修正し、main／3200／HTTPS βへ反映した。

## 変更

- Capsuleの「テーマの情報」を年表本文と同じ左右余白へ寄せる。PCは18px、800px以下は10px。選択行と見出しが枠に接しない。
- Capsuleヘッダの下線に隣接していたテーマ情報の上罫線を除く。下側の区切りは1pxを保持する。
- 情報行のgrid trackを全幅にして、Capsule共通buttonの中央寄せの影響を避ける。本文を左へそろえる。
- 投稿の通常一覧は取消済みを除き、件数付き「取消済み」から履歴へ切り替える。削除やDB上の状態変更ではない。
- 未読filterは取消済みも含める。取消前の未読結果を隠さず、表示件数と一致させる。取消済みfilterと未読filterは排他。
- 取消後・アカウントmenu再選択は通常一覧へ戻す。取消済みだけの履歴を「まだ投稿なし」と扱わない。

## 検証

既存Theme情報の8テスト、投稿UIの25テストが成功。対象ESLint・diff check・full webpack production build／全TypeScript検査が成功。余白変更のための実装を写すテストは追加せず、実ブラウザで寸法と見た目を確認した。

Chromeの実Googleログインを使い、HTTPS βのTOP→Webbテーマ構成版2→新規Capsule→情報選択→詳細を閉じる→関係図開閉を操作。見出しと選択行の余白、左揃え、上罫線0px／下罫線1pxを確認。390×844でも左右10px・横overflowなし。確認用の未保存Capsuleは破棄し、既存Capsule・KG・Themeを保存変更していない。viewport overrideも解放した。

テーマ取得に一度timeoutがあり、再取得後に上記を確認した。取得APIのlocal応答は200／約0.42秒。接続遅延の原因調査やトンネル設定変更は今回行わない。

投稿一覧の実データは確認時に通常13件／取消済み8件。通常一覧に取消済み行なし→取消済み8件の履歴→未読7件（取消済み1件を含む）→通常へ戻る、を確認。未読の個別結果を開かず、既読処理・投稿の取消・保存・公開は行っていない。スマホ幅でも既存toolbar内で切り替えられ、横overflowなし。本人が並行して投稿しているため、件数は固定仕様ではない。

画面画像は開発PCのCodex検証資材に保存した：`capsule-theme-context-padding-pc.png`／`capsule-theme-context-padding-mobile.png`／`submission-current-list.png`／`submission-cancelled-history.png`／`submission-current-list-mobile.png`。利用者の画面画像自体はrepoへ追加しない。

## 配置・運用境界

最終app source `9c821d9bd6405e23300861f42f7d926d3b065cd7`、build `zkavPW2SqgLy3u-VdjgwC`。Capsule余白の実装commitは `e10d1bcb`、一覧整理は `9c821d9b`。main／localhost:3200／HTTPS βが同じ実行物を使用する。3276・本番VPSは今回更新しない。

Webだけを短く再起動した。DB操作・追加migrationなし。既存の認証／private profileのhash、4つの知識WorkerのPIDは切替前後で一致。旧Web実行物は `/home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/submission-repair/cancelled-list-backup-20261104T142535Z` に保持。共通Kevや他プロジェクト、KG、運営Connectorの変更なし。cache再利用時もgit archiveの3070 tracked fileをsource SHAとbyte照合してfull buildを行った。

確認先：[βの知識投稿](https://graph-beta.isinxnisi.com/member/submissions)／[Webbテーマ](https://graph-beta.isinxnisi.com/?ktheme=u3%3Afbaa9ee12f288cfa%3Atheme&krev=2&kview=split)。編集中の内容は保存してからreloadする。再開手順は[段階β runbook](../runbooks/KNOWLEDGE_BETA.md)の既存launcherを使い、DB reset・seedをしない。

## 確認された別の不足：実質重複

利用者から、文言やURLパラメータの微差で同じ内容を繰り返し受理できないか質問を受け、現行コードを読取確認した。通信の同request再送を防ぐreceipt／利用量制限はあるが、別投稿の意味的な重複防止ではない。新規投稿をKG全体と比較して既存記録へ誘導する処理は未実装。新規RecordのIDは受理decision由来なので、内容が実質同じでも別投稿なら受理される余地がある。同じ記録を選ぶ訂正では、実質変更なしでも新しい内容版を作り得る。

これは今回の余白・一覧修正で解消した扱いにしない。本運用前に、機械的な同内容判定・意味重複候補の照合・並行受理時の再検証・変更なし訂正の案内が必要。資料URLは計測用パラメータなどを整理しつつ、内容を変えるqueryは保持する。既存知識へ新しい根拠や情報を加える正当な投稿を一律不受理にする設計とは区別する。現時点では不足の記録と回答までで、重複受理policyやAI prompt・queueは変更していない。U6／U7／U8の完了報告ではこの不足を落とさない。

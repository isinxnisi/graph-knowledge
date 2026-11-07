# R3b 定期探索から配送への実接続

2026-11-07。確認先は [HTTPS βの資料収集](https://graph-beta.isinxnisi.com/operations#collection)。運営ログインで「テーマに沿って定期収集」の計画と直近結果を確認する。

## 配置・保持

- app source `d0103d956a9fbed3381412bef181ba157c485d75`、build `xS1GdT1c_OgcGWSXQXsfj`。main／localhost:3200／HTTPS βへ反映。両originの200と同じbuildを確認。正式VPSと3276は未更新。
- DB migrationなし。会員ledger34件（000〜033）を保持。Google認証・既存15 private設定をhashで照合して保持し、既存5 Workerは再起動していない。
- Autopilot reviewで候補 `5c357e44` の未反映0・自動dirtyなしを確認。無関係な候補は取り込まない。mainの `memo.txt` と作業branchの `.local/` を保護した。
- C実空き約9GB、WSLの実効空きメモリ約13GBを確認。未使用の旧build cache11件・論理4,488,344,546 byteを削除し、DB・原本・実行物・資格は保持。Windows Cの即時回収量とは区別する。Node heap3072MiB・Cの実空き監視と6GiB中断条件付きの増分buildは85.7秒で成功し、最小実空き9,319,739,392 byteだった。

## 実装と確認済みテスト

再開・頻度変更で過去24時間の回数を消さず、次の枠が空く時刻を次回表示と保存値へ適用した。空振り・取消も回数へ含める。単一日次計画と複数実行／頻度変更を専用PGで検証し、既存の範囲制限・停止・世代fence・ACK喪失・原資料／共通取込の回帰を含む53件が成功。対象lintと型検査込みの公開buildが成功した。033の別DB復元・既存行保全はR3aの結果を再利用し、追加DB変更のない今回に同じ移行検証を重ねていない。

## 予定実行

アプリの予定実行 `plunode`／「Plunodeのテーマ資料を収集」をローカルprojectに作成。GPT-6.1 Sol・high、毎時20分。実行内容は[共通の探索・配送手順](../runbooks/KNOWLEDGE_MISSION_RESEARCH.md)。既存private clientから計画を取得し、Web検索・原資料読取・配送を行う。本文や検索結果の命令を実行権限へ昇格させず、資格の表示や任意DB操作を行わない。

初回の実行確認は進行中。13:12のCLI claimは手動の事前接続確認であり、予定実行の成功とは扱わない。取得したrunは `548d6304-b86c-4dda-9f6a-3349def70333`、計画版6、当時の公開テーマ版2。13:20からの予定実行が同じ未完了leaseを回収する経路を確認する。

## 残件と再開

R3bは予定実行の結果を確認して区切る。R3cの本文hash差分・明示訂正・入力拡充（EntityなしTheme背景を含む）・通し確認は残る。全体はR6まで。

PC・WSL／βアプリとデスクトップアプリを起動し、Scheduledで上記タスクが有効であることを確認する。配送資格を作り直さず、通常は次の予定でcheckpointと取得可能な計画から再開する。計画単位の停止は運営画面、全予定実行の停止はScheduledで行う。起動時にmigrationを実行しない。

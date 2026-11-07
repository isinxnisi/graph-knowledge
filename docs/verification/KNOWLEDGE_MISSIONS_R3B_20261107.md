# R3b 定期探索から配送への実接続

2026-11-07。確認先は [HTTPS βの資料収集](https://graph-beta.isinxnisi.com/operations#collection)。運営ログインで「テーマに沿って定期収集」の計画と直近結果を確認する。

## 配置・保持

- app source `662cd121621f9ec78040a0033a0ce705e528ee06`、build `-a6v6--efFNwfdsRQGwbz`。main／localhost:3200／HTTPS βへ反映。両originの200と同じbuildを確認。正式VPSと3276は未更新。
- DB migrationなし。会員ledger34件（000〜033）を保持。Google認証・既存15 private設定をhashで照合して保持し、既存5 Workerは再起動していない。
- Autopilot reviewで候補 `5c357e44` の未反映0・自動dirtyなしを確認。無関係な候補は取り込まない。mainの `memo.txt` と作業branchの `.local/` を保護した。
- C実空き約9GB、WSLの実効空きメモリ約13GBを確認。未使用の旧build cache11件・論理4,488,344,546 byteを削除し、DB・原本・実行物・資格は保持。Windows Cの即時回収量とは区別する。Node heap3072MiB・Cの実空き監視と6GiB中断条件付きの最終増分buildは132.9秒で成功し、最小実空き9,314,603,008 byteだった。

## 実装と確認済みテスト

再開・頻度変更で過去24時間の回数を消さず、次の枠が空く時刻を次回表示と保存値へ適用した。空振り・取消も回数へ含める。単一日次計画と複数実行／頻度変更を専用PGで検証し、既存の範囲制限・停止・世代fence・ACK喪失・原資料／共通取込の回帰を含む55件が成功。対象lintと型検査込みの公開buildが成功した。033の別DB復元・既存行保全はR3aの結果を再利用し、追加DB変更のない今回に同じ移行検証を重ねていない。

## 予定実行

アプリの予定実行 `plunode`／「Plunodeのテーマ資料を収集」をローカルprojectに作成。GPT-6.1 Sol・high、毎時20分。実行内容は[共通の探索・配送手順](../runbooks/KNOWLEDGE_MISSION_RESEARCH.md)。既存private clientから計画を取得し、Web検索・原資料読取・配送を行う。本文や検索結果の命令を実行権限へ昇格させず、資格の表示や任意DB操作を行わない。

初回の予定実行を確認済み。13:12のCLI claimは手動の事前接続確認であり、それだけを予定実行の成功とは扱っていない。その後、アプリの実行 `01a1b440-13b2-7d00-bc01-01b9e53d668f` が13:24:23〜13:27:50 JST（206.694秒）に同じrun `548d6304-b86c-4dda-9f6a-3349def70333`・計画版6・当時の公開Theme版2を回収。Web検索と元ページ読取、既存12記録との照合、private JSONから2項目を配送した。本人からも13:27の同じ実行履歴を確認したとの返信を受けた。

- NASA: https://science.nasa.gov/blogs/webb/2021/12/30/webbs-aft-momentum-flap-deployed/
- ESA: https://www.esa.int/Science_Exploration/Space_Science/Webb/Webb_sunshield_fully_deployed
- receipt `1691680b-f2ee-48b6-b9b0-afc0db797fe5`。配送直後はprocessing／queuedであり、その時点の実行報告は公開完了と書いていない。13:29には既存Workerで両項目published、公開Theme版4／14件を確認。旧Theme版2／12記録版は両originで完全一致を維持した。[機械可読の照合結果](KNOWLEDGE_MISSIONS_R3B_20261107.json)。
- 予定実行のprivate作業directoryは0700、JSON・要約0600を確認。資料のlanguageはen、本文／引用fieldのtextLanguagesは初回未指定で、不明として保持された。今後の予定prompt・手順にはfieldごとの明示を追加し、R3cの入力拡充で実配送を確認する。原語の本文自体は保存されている。
- 実Googleの運営画面で「反映済み」、2件の「知識を読む」への導線、公開本文・原資料・引用を確認。note直リンクで遅延警告、再取得後にGraph 0対象となる表示を一度観測した。API・Themeへの反映は正常で、通常探索の再取得状態はR4へ記録し、原因を断定していない。PC幅の運営画面を保存。R3aの390px確認は再利用し、今回のレイアウト変更はない。

最初に通常のチャット一覧だけを見て未起動の可能性を疑ったが、同一覧は予定実行履歴を列挙せず、Scheduled／既知実行IDで取得できた。アプリを押すWindows UI操作はGetCursorPosのアクセス拒否だったため、本人へ表示確認を依頼したが、予定実行・配送は成立していた。ブラウザ再起動や設定変更は要求していない。通常の完了通知は抑え、アプリ実行の失敗時を通知する。

## 残件と再開

R3bは完了。次はR3c。R3cの本文hash差分・明示訂正・入力拡充（EntityなしTheme背景を含む）・通し確認は残る。全体はR6まで。

PC・WSL／βアプリとデスクトップアプリを起動し、Scheduledで上記タスクが有効であることを確認する。配送資格を作り直さず、通常は次の予定でcheckpointと取得可能な計画から再開する。計画単位の停止は運営画面、全予定実行の停止はScheduledで行う。起動時にmigrationを実行しない。


再開時の補強として、clientの保存済みleaseも探索前にサーバーへ照合するresumeを追加。停止・変更・期限切れは旧briefを返さず、照合応答不完全時はcheckpointを保持する。専用PGの9件を含む51件とclient4件の計55件が最終成功。clientの新規テストのmock応答を再利用した失敗は、fresh Responseを返すfixtureへ修正し、その4件のみ再実行した。最終sourceでは型検査込みbuildが成功し、Webだけを切替、WorkerとDB・private設定を保持した。

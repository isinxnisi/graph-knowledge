# R3a：収集計画・範囲付き配送をβへ接続

**R3a完了、次はR3b｜R3はcまで｜全体はR6まで。** R3bの予定実行とR3cの差分更新・実資料の通し確認は未完了。今回のAPI接続確認を、自動資料探索の実証と混同しない。

## 確認先・使い方

[βの資料の収集](https://graph-beta.isinxnisi.com/operations#collection)を運営アカウントで開く。「テーマに沿って定期収集」の「計画を追加」から、テーマまたは核となる対象、問い、資料host、頻度・資料数・項目数を保存する。既存のURL指定による取得・読解は同じ画面に残る。設定フォームは閉じた状態を初期表示にし、スマホでも常時画面を占めない。

「Webbの打上げと展開を追う」を保存・編集・再訪し、停止状態で残した。NASA／ESAの2host、1日ごと、資料2・項目3。実際の予定実行は未接続なので、この状態で新しい資料が自動登録されるとは報告しない。毎回の管理者承認を必要にする方針へ変更したものでもない。

## 配置・保全

- アプリsource `a6b2e2eaf37a9d09876c7bde76e813ac24fb8aa7`、build `zLg4ZAkesFvHBwwc8A6H_`。Git archiveの全tracked fileを照合してbuild。新routeのtraceに会員033を含むことを確認した。
- mainを固定SHAへffし、localhost:3200／HTTPS βへ配置。Webと既存5 Workerを再開。独立3276、正式VPS、共有Kev、KG用ops・別収集Workerは更新しない。
- 会員追加migrationは `033-knowledge-missions.sql` だけ。別DBへの復元・追加・再実行の確認を再利用し、切替直前に会員／知識DBの新しいdumpを取得した。会員69既存テーブルの行fingerprintと適用済みchecksumを保持、ledger33→34、再実行不変を確認。知識DBにはmigrationを適用せず、原本3テーブル（objects／revisions／migrations）も保持した。
- backupは作業treeの `.local/r3a/activation-r2-backup-20261106T231113Z/`。ディレクトリ0700、dump0600。dumpのSHA256と検証結果は[構造化記録](KNOWLEDGE_MISSIONS_R3A_20261107.json)を参照する。DBや秘密値本体はGitへ入れない。
- 既存private設定12本は、配置profileにmissions capabilityを加えた以外は不変。専用配送設定・token・client設定を本人所有0600、checkpointを0700で追加した。既存のGoogle認証・会員allowlist・Gemini設定／利用量台帳を維持した。

## 実際に確認した範囲

- 既存Googleアカウントでログインし、計画作成→保存→名前変更→保存→再訪を確認。保存しない編集の破棄、停止→再開→再停止も確認した。最終計画版5・停止中・created_byあり。
- 390×844の設定フォーム、閉じた一覧、PC幅を確認。スマホのdocument幅380／scroll幅380で横はみ出しなし。確認後にviewportを戻した。
- 運営APIの未ログインGETは401、配送APIの資格なしPOSTは401。専用clientの実HTTPS接続は成功し、停止計画だけの状態でlease=null。実行件数0、配送元の接続記録1。画面の「配送元の最終接続」はこの手動確認であり、予定実行を設定した証拠ではない。
- 前回通った対象52件、既存取込37件、lint・型検査を再利用。今回の固定SHAのbuildも型検査込みで成功。fixtureではACK喪失回収、期限・世代・計画版、停止と最終適用の競合、範囲外host／対象、件数上限、テーマ背景等を確認している。
- 今回のmission確認では実資料の探索、Gemini確認、新しい知識の登録は行っていない。これらを含む実際の定期配送はR3b／cで閉じる。過去のR1共通受理・R2自動整理の実AI確認をやり直していない。

## 作業中の修正と効率

前回はWindows C空き0でbuildが中断した。今回は開始前と実行中のC実空きを監視し、10GiBを下回る場合にbuildを停止するよう作業helperを変更。Node heap上限3072MiB、既存cacheを利用し、約115秒でbuild成功。監視中の最小空きは約13.6GiB。稼働していない2つの旧build cacheだけを約0.84GiB（論理サイズ）整理した。VHD圧縮や私有データ削除を実施したという意味ではない。

最初の切替では、今回変更しない知識DBの大きなキャッシュまで全文をstring_aggで連結する保全確認が約1GiBのPostgreSQL文字列上限に達した。読み取り処理の失敗で、migration前に停止し、既存Web／Workerを復帰した。会員DBは行ごとのdigestを集約し、知識DBは変更しないキャッシュの全文照合を除いて原本を確認する手順へ修正し、切替を完了した。全データの総当たり再検証を追加の完了条件にはしない。

## 残件・再開

- **R3b**：現在の専用client／lease／packageIdentityを、実際の予定実行から使う。ChatGPT側の資料探索→API直送を優先し、利用環境で成立しなければ同じpackageのIssue adapterを検証する。新しいURL探索API・課金サービスを前提にしない。
- **R3c**：取得済み本文とのhash差分、明示訂正、入力経路の拡充、実資料の通し確認。現在の計画は核となるEntityがある公開テーマ、または指定Entityが対象。Entityを含まないThemeだけへの背景収集も、この残件に含め、無関係なEntityの追加で代用しない。
- 停止・再開で直近24時間の実行数を消さない。実行上限を使った後の再開では、nextDue表示が実際にleaseを取得できる時刻とずれ得るため、R3bの予定実行接続時に上限待ちの表示と揃える。
- 操作画面の対象検索は全公開Entityへ条件を適用し、先頭40候補を表示する。広いテーマは核となる対象を指定する。計画30件、host8件、1回資料5・項目10まで。範囲はサーバーでも制限する。

通常再起動はmainの既存launcherを使う。private `beta-missions.json` と既存profileを読み、追加migrationは自動適用しない。

~~~sh
python3 scripts/start-local-previews.py beta --node /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/issue75/node
~~~

停止時は未反映分を止め、公開済み知識・旧Theme／Capsuleを保持する。不具合時は新しい形式を読めるWebを維持し、missions capabilityを止めて修復する。古いdumpによる上書きや旧Webへの機械的巻戻しはしない。[運用runbook](../runbooks/KNOWLEDGE_MISSIONS.md)／[設計](../design/KNOWLEDGE_MISSIONS_R3.md)。

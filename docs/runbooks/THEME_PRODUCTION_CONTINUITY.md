# テーマ制作の継続と後日対応

## 日常の判断

| 現在の状況 | 操作 |
| --- | --- |
| 具体的な次の手段があり、作品の重要な改善ができる | 同じ案件で調査・修正・反映・読戻しを進める |
| 未対応はあるが、掲載する作品が成立する | `update_theme_production` の `followUps` と `progress` で理由・影響・対応結果・再対応条件を記録し、公開前の残件から外す。別起動の独立見直しで現行版と実画面を評価する |
| 重大な不足が現時点で回復できない | 原稿・資料・理由を保存し、受付の照会・回復を試す。leaseをreleaseし、最新versionで `abandon_theme_production(park:{resumeWhen,topicKey})`。定期制作の枠が空く |
| 条件が変わった | 退避された同じ案件ID、元のphaseとworkflow、最新versionで `claim_theme_production` に `resume:{expectedVersion,reason}` を渡す。元の受付・現在版・ガイドを読戻し、独立見直しの評価を更新する |

運営画面の **テーマ → 後日対応と非公開の退避案件** で、題材、説明、キー、テーマIDや案件IDを検索する。MCPでは `list_theme_production_follow_ups` と `list_theme_productions(parkedOnly:true)` を使う。既存のテーマ別履歴は `list_theme_productions(themeId:…)`、保存済みの正確な送信・操作は `get_theme_production(caseId:…, submissionId:…/operationCursor:0)` で確認する。

公開を妨げない事項は、解決していなくても記録を添えて先へ進める。年表と根拠、掲載物の権利、必要な日英、版、独立見直し、実表示と公開の必須条件を確かめる。 `complete` には公開前の残件が空であることも必要。既存の失敗受付で `assessment.exceptions` が必要な場合は、対応した `submissionId` と理由を記録する。

後日対応は `progress.artifacts.productionContinuity` に保存され、次回の進捗置換で消えない。テーマ固有のキーは同一テーマ、共通キーは同一所有者・環境・originで一つの一覧項目として表示し、影響する案件・版を関連付ける。再発を確認しただけなら既存キーと影響を書く。確認方法や結果が変わったときは同じキーのrecordを更新する。日常の運営では新しい所見や重要な変化だけを伝える。

確認済みの非公開退避は従来の `abandoned` と区別できる `suspension` を持つ。退避前に記録された原稿・評価・未決受付は残る。通常の終了を使う既存UI/APIは引き続き未決受付を拒否する。退避後、準備済みの送信を再開するには元案件のleaseが必要。既に受理済みの登録が遅れて反映されても、確認先は元の受付・元のテーマ。画像・採取Workerは退避案件から新たな処理を開始しない。走行済みの結果は元受付に保存され、失効後の不明結果は従来どおり扱う。退避しても別案件へ画像IDや受付を引き継がない。

完了後に切替が中断した場合は既存の `retryCommand`・公開競合の照合を優先する。回復手段が尽きた場合、承認の有無を公開切替と同じ案件ロック下で読み取る。承認済み完了は退避できない。未承認と確認したintentは、退避後に旧completeの再送で有効にならない。承認の照会自体が失敗している間は、その案件の切替判断を保留する。

## 本番切替の順番

#76の案件照会・非公開終了と、#81の動的ガイド・プレビュー証拠の現行経路を使う。2026-11-25の読み取りでは、本番はガイド25（基準25、画面要件15）で、制作00分・独立見直し30分は両方有効。 #81で一時停止していた時点の記録は履歴。管理者の読み取り監査で、正式Webと4 Workerは `74d05fad`、正式Webと専用プレビューWorkerは同じbuild `U9jyiCcymmTGXPsIV2oWP` と確認した。正式のmigration台帳は会員51件・知識13件。βの知識台帳は12件で、正式だけに適用済みの `003-submissions.sql` を含め、正式台帳に記録されたSQLのチェックサムは候補sourceと照合する。 [Issue #76](https://github.com/isinxnisi/graph-knowledge/issues/76) [Issue #81](https://github.com/isinxnisi/graph-knowledge/issues/81)

1. [共通本番公開手順](PRODUCTION_RELEASE.md) に従い、正式監査、β受入記録と固定sourceから適用先を決める。今回の差分にSQLや画面要件の追加はない。受入済みの固定候補 `a9b8a84cc135b78d7d4a8a1326292e4b08969dd0` で、Web、知識3 Worker、専用 `theme-automation` Workerを一緒に切り替える。プレビュー証拠のbuild比較に合わせ、正式Webと専用Workerには同じbuildを封印する。切替直前にガイド・lease・未決受付・公開intentを照合し、専用Workerと知識3 Workerを停止してからWebを切り替える。新Webを読戻した後にWorkerを起動する。新Webの起動前は旧版に戻し、その後は共通手順の前進復旧を使う。
2. 正式切替後に既存の接続確認案件、現在scheduled、既存ガイドを読戻す。MCPの `list_theme_production_follow_ups`、 `list_theme_productions` の `parkedOnly` と `query`、 `abandon_theme_production.park`、 `claim_theme_production.resume`、 `update_theme_production.followUps`、 `create_theme_production.topicKey` が公開ツール定義に載ることを一度確認する。ChatGPT本番Appの定義が古い場合は既存Appのツールを更新し、権限・接続先を再確認する。証拠PNGの既存definitionと別起動の取り出しも確認する。
3. 本番の現行ガイドを管理用読み取りから取得し、同じrevisionで各bodyKeyを最後のoffsetまで結合する。required・sections・assistance・evidenceの形へ戻し、上書き前の全文を版付きで退避する。次のコマンドで現行版と本文の一致を検査し、書込み用JSONを作る。差分を確認して `update_theme_work_guide` へ渡し、同じ入力の再送には同じIDを使う。予期しない最新版では本文を照合し直す。画面要件は保持され、必須編集基準の改訂で未確定の過去評価は現行基準で見直す。旧全文APIと契約2の必須部・対象節、履歴と版を読み戻す。

   ```sh
   (umask 077; python3 scripts/prepare-theme-production-continuity.py guide current-guide.json > guide-update.json)
   ```

4. ChatGPT Webのスケジュールで、先に **Plunodeのテーマを独立して見直す** の指示全文を [見直し用本文](theme-production-continuity/independent-review.md) へ置き換える。制作と同じ本番Appの帰属、毎時30分、既存の有効状態と対象会話を保存後に再度編集欄を開いて照合する。次に **Plunodeのテーマ制作を進める** を [制作用本文](theme-production-continuity/production.md) へ全文置換し、毎時00分と同じ項目を確認する。両方とも旧契約案件と契約2案件に対応する。元の2本文を切替直前に保存しておく。作業途中の起動がない時間帯を使う。既存の資料収集とAI教育は従来の予定で稼働する。
5. 次の手順で停滞案件の進捗を整え、制作・独立見直しを通常Chatの別起動で読戻す。独立評価を経た公開、または非公開退避の結果と後日対応の一覧を確認する。次の制作予定では、それまでの案件と異なる題材のscheduled案件が取得され、出典の確認、初稿、登録受付など最初の具体的な制作成果が保存されたことを、案件ID・版とともに読戻す。作品の実際の合否を記録する。

保存後に問題が出た場合は、新しい予定の追加書込みを止め、元のプロンプトを戻して読戻す。ガイドはCASと `restoreRevision` で過去の本文を新しい版として復元する。評価が自動で復活することはない。退避や復帰を適用済みなら旧APIで受付を送り直さず、元案件・最新版・承認済みreleaseと未承認intentを確認し、対応版で前進復旧する。

## 11月26日の本番切替記録

01:29 JSTにWeb、知識3 Worker、専用プレビューWorkerを固定候補へ切り替えた。正式buildは `YbHfEJTnvcfoN6kZHAVxx`、封印SHA-256は `429008b201026ff5640cc7d623051177311be0a57a5083ceaae3e66e0c3a0333`。旧Composeと復旧履歴はVPSの `/opt/graph-knowledge/backups/release-a9b8a84cc135-429008b201026ff5`。正式HTTPSのdataset・検索・互換性APIと公開世代 `k75-5083ca0171903c7269ad1642ca877031` を照合した。

本番Appの定義を更新し、接続確認案件、後日対応一覧、退避一覧を読戻した。品質ガイドは第26版（基準26、画面要件15）。通常Chatで独立見直し30分、制作00分の順に指示全文を保存し、既存の有効状態と本文を読戻した。ダーウィンとウォレスは作業第9版、案件版431。後日対応3件の関連付け、未決送信0、旧待機条件を外した進捗を読み戻してleaseを解放した。引継ぎから次題材の最初の制作成果までを通常Chatの実行で確認する。

## 通常Chatでのβ接続確認文

```text
「Plunode資料収集 API（β）」で読取りだけを行ってください。
get_theme_production に caseId 380ed892-aae1-4daa-abc4-83cd64822cc1 を渡してください。同じID、environment=beta、origin=https://graph-beta.isinxnisi.com が返ることを確認し、異なる場合は以降の確認を止めてください。
同じ接続で read_theme_work_guide（phase=production、contractVersion=2）、list_theme_production_follow_ups（query=continuity-beta-readback）、list_theme_productions（parkedOnly=true、query=continuity-beta-readback）を読んでください。
ガイド版・基準版・画面要件版と、各一覧が応答したかを短く報告してください。受付、claim、保存、公開は実行しないでください。
```

## 通常Chatでの本番接続確認文

```text
「Plunodeテーマ・資料 API（本番）」で読取りだけを行ってください。
get_theme_production に caseId db6a0a28-51ac-4db1-b8fc-87043c93dd69 を渡し、同じID、environment=production、origin=https://plunode.net が返ることを確認してください。異なる場合は以降の確認を止めてください。
同じ接続で、caseIdを省略した get_theme_production、read_theme_work_guide（phase=production、contractVersion=2）の現行版、list_theme_production_follow_ups（query=continuity-connection-readback）、list_theme_productions（parkedOnly=true、query=continuity-connection-readback）を読み取ってください。
接続先、ガイド版・基準版・画面要件版、各一覧が応答したかを短く報告してください。受付、claim、保存、公開は実行しないでください。
```

## ダーウィンとウォレスの進捗移行

本番案件 `60d01f8d-275c-4359-9645-2f63a156761d`。着手時の読取りでは、非公開の作業第9版で日英各16行、Story3組、画像参照2件、商品ピン0、未決送信0。実資料画像の認可添付、関連3版の書影の利用条件、Amazon購入先の確認を後日対応候補とする。既存の出来事挿絵の表示や作品の成立は独立見直しで判断する。

1. 上の切替後、制作予定の同時起動がない間に `get_theme_production`、`read_theme`、`read_theme_automation` を再取得する。対象・digest・言語・受付、既存画像と商品参照、最新の `unfinished`・`blockers`・`workLoop` を照合する。重大な新しい不足や別版があれば、下の固定記録のまま移行せず現行条件で判断し直す。
2. 後日対応の共通キー `licensed-archival-image-chat-intake` と `amazon-offer-check-unavailable` を検索し、該当項目をまとめて `{"items":[…]}` の形でローカルの非公開ファイルへ保存する。該当なしは空配列。制作phaseをclaimし、現在のclaim応答を非公開ファイルに保存する。次で作ったJSONを `update_theme_production` に渡す。この処理は既知の旧待機内容を照合し、原稿と参照を保持したまま任意事項を `followUps` に記録し、`scope`・`unfinished`・`blockers`・`workLoop`・素材チェックポイントの再開指示を更新する。変更前の条件は履歴用artifactに保持する。

   ```sh
   (umask 077; python3 scripts/prepare-theme-production-continuity.py darwin claim.json matching-followups.json > darwin-save.json)
   ```

3. 保存応答の版とcase読戻しで、旧待機文が現行の次作業から外れ、3件が記録済みであることを確かめる。まだ必要な制作作業があれば続ける。制作稿として成立する場合は、現行版と評価論点を添え、引継ぎ済みの制作作業を `unfinished` から外して有効なleaseで `handoff`。別起動で第9版またはその後の現行版を評価する。再公開やpassの先行登録は行わない。

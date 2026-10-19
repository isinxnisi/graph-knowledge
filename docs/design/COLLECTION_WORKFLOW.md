# 収集・受入レビューから公開release準備までのワークフロー

2026-10-20追記：[承認済み受入の逐次継続](COLLECTION_ACCEPTANCE_SEQUENCE.md)は、元の判断ファイルを変更せず、別proofで比較更新と対象・依存の同一性を証明する。古い比較を拒否する通常検査は維持する。Phase Bの実装・隔離検証であり、新Worker投入・実正式受入の追加実行は別判断。

2026-10-19追記：[Issue起点の自動準備](COLLECTION_ISSUE_INTAKE.md)は既存の明示的人間許可を入力にrecipeと実行依頼を生成し、本書のcollect-reviewを変更せず利用する。個別正式受入・公開applyを収集許可へ含めない。

2026-10-18初期実装。2026-10-17 21:02 JST指示のタスク1を実装した。対象はmanga-discovery-v2のみ。テーマの実行承認、重要な意味／同一性判断、個別正式受入、公開apply承認の境界を維持する。画面・API・scheduler・ジョブDB・Kev連携は追加しない。

## 通常操作

既存の手動作業ロックを取得したWSLのrepoルートで、Node24と依存を利用できる状態にして実行する。テーマの特定revision・定義SHA・code／input hashへの実行承認は、既存collection-themes.pyで人間が先に行う。

```bash
python3 scripts/collection-workflow.py collect-review famous-manga-creators \
  --revision 3 \
  --definition-sha 371d297eb8cbf700d429711acc018bd46b5619a36ffb2c3ab1903e7f87a7c728
```

この具体例は完了済みr0003ジョブを再利用する。残り70作品を追加取得する指定ではない。次版では新しい承認済みrevisionとその定義hashを指定する。NodeがPATHにないこのPCでは、既存と同じく実行時だけ `env PATH="/tmp/graph-knowledge-node/bin:$PATH"` を先頭に付ける。接続設定やWindows予定設定は変更しない。

1. 既存gateの定義・承認・取消・現行collector code／input hash・上限を検証する。旧承認へ新コードを付け替えず、不一致は新revisionのレビューを要求する。
2. 既存gateのrun dispatcherで収集実行または同じジョブを再開し、inspectと全artifact hashを確認する。gate／v1／v2の既存コードは今回変更していない。新workflowのcode SHAはレビューcontextへ別に記録する。
3. 既存public:backupでローカル公開KGを無書込取得する。既存のbackup validatorでchecksum／schema／graph fingerprint／撤回・receipt・外部ID履歴を検証し、repoの対応release artifactとも照合する。環境ファイルや認証値を資料へ出力しない。一時backupは処理後削除する。
4. 正式受入記録とhashで全件を裏付けられる累積漫画release候補を自動検出する。単に最新IDを信用しない。各レコードを参照先の凍結proposed records、対象UUID／scope、記録された編集注記と照合し、既存public:validateも利用する。未適用候補を公開baseにしない。
5. Wikidataの人物／漫画同定、NDL作成書誌の原責任表示、ISBN・巻・版・言語・作品との対応、Role・period、Source／Citation、既存UUID・同一意味・外部IDの重複を確認する。通常グループ、同一性だけの別グループ、保留と既存再利用を分ける。
6. 人間用README、review、hiddenのproposed records、decision-request、代表経路を生成する。承認・入力・元ジョブが途中で変化していないことを最終確認する。

標準出力はjob ID、reviewDirectory、件数、collectionUnchanged／reviewUnchanged、今回追加されたtransportAttemptsAddedを返す。成功時でもformalAcceptance=false、publicApply=false。既受入状態の表示は参照記録の再利用であり、このコマンドで新たに受入した意味ではない。

## レビュー資料と再実行

既定の出力先は `datasets/manga-collection/workflow-reviews/<job>-review-<hash>/`。Gitへ記録できる追加資料であり、元ジョブは変更しない。`--reviews DIR` をサブコマンドの前に置けば隔離先も指定できる。registry／job／公開release内を出力先にする指定は拒否する。

| ファイル | 内容 |
| --- | --- |
| README.md | 全Claim／Entityの一覧、原語、ISBN scope、Citation／Source、保留理由、代表経路 |
| context.json | 承認定義・collector／workflow code SHA、元ジョブinventory、公開release／実測revision、既受入参照hash |
| review.json | 個別照合と再利用・保留、元責任表示の保留、既存受入状態、通常分と同定のみ候補の分類 |
| proposed-records.json | 通常判断グループのレコード。新規Claimはhidden。公開apply入力ではない |
| identity-only-records.json | 通常Claimの端点にならない同定のみ候補。関係受入を含意しない |
| decision-request.json | グループ別対象UUID、Claim意味／scope、既存端点依存、根拠artifact hash。判断者／日時はnull |
| exploration-paths.json | 各接続のEntity／Claim／Role／scope／Citation／Source UUIDと収集候補・既受入・公開snapshotの状態 |
| review-manifest.json | 全生成物hashとレビュー入力hash。正式受入・公開の記録ではない |

同じジョブ・公開revision／内容・既受入集合・workflowコードなら同じレビューを再利用し、取得・重複生成をしない。backupの保存時刻だけで別資料を量産しない。途中の資料生成失敗では未完成bundleを残さず、完了済み収集ジョブを再利用して生成から再試行する。入力やコードが変わった場合は別hashのレビューを追加し、前の版を上書きしない。既存bundleの改変は検出して停止する。

通信timeout等は既存Fetcherの上限・キャッシュ・Retry-Afterを維持し、同じコマンドで再開する。予算超過・キャッシュ改変は停止する。未承認・取消・hash不一致を自動承認や無制限retryで回避しない。

## 例外と既受入の再利用

原語「漫画」、集合著者、未知Role、根拠不足、同一性衝突、刊行物と作品の対応不明、scope不一致は推測で正規化せず保留する。完全一致の既存Claim／Source／Citationは再生成しない。異なるISBN scopeは別の独立Claimのまま。通常分に必要な新規Entityと、同定のみ判断するEntityを別グループにする。

人間が正式受入した記録にUUID／Claim対応がある場合は、元ID・対象ID・同定・意味／scopeが一致するものだけを参照上再利用する。元データや既存Entity／QIDは書き換えない。r0003では承認済みのPineapple対応1 Entity・2 Claimを再利用し、童夢の既受入範囲を再承認対象へ戻さない。未知の別作品へこの対応を一般化しない。新しいCitationやscopeを承認済みとみなす機能ではない。

既存の広いCONTRIBUTED_TO（roleId=null）は広い関与のまま。新しい具体Roleを推論しない。撤回済み公開Claimを復活させたり、経路へ含めたりしない。

代表経路は最大6件・各段候補20件の有界な例で、網羅的カバレッジではない。各接続を実際のClaimと根拠へ戻せることを確認し、逆向き探索や経由から新しい人物間の直接Claimを作らない。収集候補／正式受入済み未適用／公開snapshot収録を各接続に表示する。公開snapshotでの接続確認は、公開API・実画面で経路を実操作した記録とは分ける。

## 凍結資料・明示的な比較入力

過去コードの承認が現行collectorと一致しない場合、collect-reviewは実行を拒否する。新しい隔離テーマ／承認で試験し、実承認は変更しない。完了済み成果の検証だけなら、別の読み取り専用モードを使う。

```bash
python3 scripts/collection-workflow.py review-job JOB_ID --public-backup BACKUP_JSON
```

review-jobは取得・承認の付け替えをせず、元の承認packet・input hash・成果inventoryを確認する。`--public-backup` は供給した時点のsnapshotという表示になり、現在の公開収録確認を意味しない。

比較する既受入集合を明示する場合は `--accepted-release DIR --accepted-receipt FILE` を使う。複数receiptはフラグを繰り返す。r0002／r0003の3記録を省いて統合候補のpublishedだけを信用することはない。既存の全正式受入記録を覆う候補がない、hash不一致、複数の矛盾した候補がある場合は停止し、入力・受入／release準備状況を確認する。

## 実行・試験結果（2026-10-18）

[検証記録](../../datasets/manga-collection/workflow-validation-20261018/verification.json)とCLIの初回／再実行・凍結比較結果を保存した。

- 凍結r0003を、当時の公開snapshot＋r0002受入済み追加集合で比較し、通常25 Claim・36 Entityのレビューを再現。通常判断レコード35 Entity／25 Claim／21 Source／25 Citationは、旧資料とUUIDだけでなく本文・scope・既存端点依存まで一致。同定のみ4 Entityは別グループ。Pineapple衝突・童夢の追加対応・原責任表示の保留は新規推測で解決しない。
- 通常の実コマンドは既存r0003を無変更で再利用し、現在は正式受入済みの28収集Claimを再利用した。原作業で追加資料から別途作成した3 Claimも既受入集合へ読み込む。新規判断対象0、追加通信0。元の「漫画」「集約著者」2行は保持する。
- その実コマンドの再実行はcollectionUnchanged=true、reviewUnchanged=true、transportAttemptsAdded=0。元ジョブの全artifact・実行試行・通信cacheは、凍結実行記録と一致した。
- workflow16・既存gate15・既存漫画adapter16・r0003受入／レビュー14、合計61テスト成功。未承認、取消（途中取消を含む）、定義／code／input hash不一致、通信中断、cache改変、予算超過、重複Entity、未知Role、根拠不足、scope不一致、資料生成単独再開、改変検出を確認。
- 隔離した実CLI一回で収集→既存validator→inspect→通常レビュー・decision-requestまで実行。providerの選択フィールド応答をchecksum付きcacheへ事前配置した試験で、外部通信・DB書込みはない。別の偽通信による中断試験は71応答／72試行（上限142）で同じジョブを再開し、再実行で通信0。

ローカル3200・ベータの/api/datasetは200、revision 82b01515-594c-48ca-b4b6-515eefac83caを維持。Web／API／DB schemaの変更はなく、再build・配置は不要。VPS・会員DBは変更していない。実テーマの承認・正式受入記録・過去releaseと収集成果も変更していない。

## 人間判断とタスク2への引継ぎ

実行範囲への承認、重要な意味／同一性・未対応表記・追加根拠の判断、個別正式受入、公開apply承認は人間に残る。通常レコードの候補資料生成と再開のために、毎回個別のコード操作を依頼する必要はない。新batch自体の企画・定義・通信予算と承認は別工程。

タスク2は以下のaccept-releaseとして実装した。collect-review自体は引き続き受入もapplyもしない。

## タスク2：人間の判断ファイルから公開準備まで

2026-10-18 13:03 JST指示。Task1のhash付きreview bundle（schemaVersion=1）を入力とし、判断ファイルの対象UUID・レコード本文hash・Claim意味／scope・全根拠hashを照合する。AIの推奨やgroup指定だけを正式承認にはしない。旧r0003の手動受入記録・凍結レビュー・releaseは変更せず、Task1形式で再現したr0003を隔離試験に使う。

### 人間が承認を渡す操作

1. collect-reviewが返したREADME、review.json、decision-request.jsonと原資料を確認する。
2. 次のコマンドで**未承認の雛形**をGit管理先へ作る。実際の次版レビューのパス・判断ID・未使用release IDを指定する。以下は操作形の例であり、残り70作品の承認や実行を意味しない。

```bash
python3 scripts/collection-workflow.py decision-template \
  --review datasets/manga-collection/workflow-reviews/REVIEW_ID \
  --decision-id manga-next-acceptance-001 --release RELEASE_ID \
  --output datasets/manga-collection/decisions/DECISION_ID.json
```

通常の全候補を雛形へ展開する。部分受入は `--claim-id UUID` を必要数指定して、対象Claimに必要な新規Entity・Source・Citationの明示IDも展開する。同定のみなら `--group identity-only`。依存レコードを勝手に補って受入することはない。未選択・保留は受入対象外。

3. **人間が**ファイルの全対象ID・scope・hashを確認し、次の4項目を編集して判断を確定する。actorType=humanと残りの対象・根拠・公開禁止条件は維持する。

```json
{
  "status": "approved",
  "humanDecision": {
    "actorType": "human",
    "reviewer": "プロジェクト運営者",
    "decidedAt": "実際に判断したISO 8601日時（タイムゾーン付き）",
    "statement": "このファイルに列挙したUUID・意味・scope・根拠の正式受入とrelease準備を承認する。公開applyは承認しない。"
  }
}
```

これはファイル全体ではなく編集箇所の例。既定のdraft-not-approved、判断者／日時／判断文がnullの雛形、AI主体、apply権限ありのファイルは実行拒否する。`approvalScope` は formal-record-acceptance-and-release-preparation-only、applyAuthorizedは全環境false固定。重要な意味・同定の変更は元レビューの新しい版で判断し、承認ファイルだけを編集して候補の意味を変えない。

4. 判断ファイルを信頼する運営者のGitHub commit／レビュー手順で管理し、`sha256sum FILE` の値を確認して実行する。ChatGPTで検討した内容も、まずこの判断ファイルへ人間が確定して渡せる。ChatGPTからローカルCLIが起動できることは前提にしない。

```bash
python3 scripts/collection-workflow.py accept-release \
  --decision datasets/manga-collection/decisions/DECISION_ID.json \
  --decision-sha APPROVED_FILE_SHA256
```

引き続きNode24と既存のローカルpublic接続設定が必要。既存の手動共通ロック内で実行する。単一コマンドだけなら既存 `scripts/autopilot.py guard -- COMMAND ...` で保護できる（hold中にguardを重ねない）。正式受入からplanまでを一回の操作で実行し、Codexへの文章指示や確認フラグは不要。

このファイル／hashは改変検知と判断範囲の記録であり、電子署名・GitHub本人認証を実装したものではない。人間の判断者名をAIが記入しただけでは運用上の承認にならない。承認済みファイルを登録・実行する権限は、既存の信頼された運営者とGitHubのレビュー運用で管理する。CLIは本人性を外部サービスへ照会しない。

### 自動処理と保存先

1. 人間判断のhash、review manifestの全inventory、元ジョブ・入力・根拠、対象の明示ID／本文hash／scopeを照合。未解決の保留・未レビューID・重複UUIDを拒否する。
2. レビューが参照した既受入追加集合を、既存acceptance.jsonと凍結レコードで再検証する。他の正式受入が後から増えていれば黙って省かず停止する。既存公開KGとは別の追加集合として扱う。
3. public:backupを無書込で取得し、実際のbaseRelease／revisionと判断対象を照合する。既存UUID・全レコード・withdrawals・claimOriginsを保全し、Source URL・ExternalIdentifier・同一意味Claim・Citationの重複や衝突を拒否する。異なるISBN scopeは統合しない。
4. 人間が明示したEntity・Claim・Source・Citationだけを選び、閉じた依存と支持Citationを確認。既存validatorで一時ファイルを事前検証してから、実記録日時の正式受入記録を一度保存する。原語・注記は変更せず、受入状態の正本はreceiptとする。
5. 受入済み追加集合と今回分だけを現在公開baseへ加え、新releaseを作る。今回受入Claimをreleaseファイル内でpublishedにするが、KGには書き込まない。元のhidden候補は不変。
6. 既存public:validateと毎回新しいpublic:planを実行する。前後のrelease／revision、知識、外部ID UUID、receipt・identity・撤回履歴をhashで照合し、不一致は停止する。planの既存更新は0必須。
7. 件数・再利用・保留・未選択ID、Role・scope・Citation／Source・状態付きの代表経路をJSONとMarkdownへ保存する。経路は実Claimに基づく代表例で、公開画面での実探索確認とは別。

既定の保存先：

| 保存先 | 内容 |
| --- | --- |
| datasets/manga-collection/accepted-DECISION_ID/acceptance.json | 人間判断・実記録日時・全対象UUID・scope・参照hash。正式受入済み未適用の正本 |
| 同decision.json／accepted-records.json | 判断ファイルの不変コピー／選択した元レコード（Claimはhiddenのまま） |
| 同acceptance-manifest.json | 上記3ファイルのhash。release作成前の中断でも受入日時・本文の改変を検出 |
| datasets/public-kg/releases/RELEASE_ID/{data,manifest}.json | 受入済みだけの新しい累積release候補。既存releaseを上書きしない |
| 同受入ディレクトリのvalidation.json | release／validatorのhashに対応する検証結果 |
| 同preparation.json／preparation.md | 最新の成功／未完了状態、無書込plan・件数・保留・経路。再実行で更新する運用報告 |

新receipt／releaseは次回collect-reviewの既受入照合で再利用できる。未適用releaseを公開baseにはしない。過去の特例マッピングやSource注記の編集を新候補へ一般化しない。

### 再実行・失敗・競合

同じコマンドを再実行する。元の判断ファイル／hash、受入日時、受入本文、releaseの全内容は不変。受入後にvalidate・planが失敗しても、成功済み記録を残して再開する。事前のschema／根拠照合は再確認し、保存済みreleaseのvalidate結果は同じ内容なら再利用する。**planは成功済みでも必ず取り直す。**

既存の受入／release IDを別内容へ付け替えない。参照hash・Role・scope・同一性対応・UUIDに差があれば停止する。base／revisionが変わった場合も新状態のレビューを要求し、古い判断のbaseを書き換えない。既に保存された正式受入そのものを取り消したり、失敗を未受入に読み替えたりしない。preparation-incomplete-not-appliedは公開準備の未完了であり、receiptがある場合は受入記録が保存済み。

`--acceptances DIR --releases DIR` は隔離試験／別の明示的な保存先用。通常運用では既定を使い、既存受入の検出を意図的に省く用途には使わない。入力ファイルや既存成果を出力先に重ねることはできない。

### 残る人間操作・不足

テーマの実行承認、重要な意味／同一性・追加資料の判断、正式受入ファイルの確定、公開apply承認は人間に残る。通常の承認済み収集→レビューと、正式受入→release／validate／planはそれぞれ既存CLI一回で進められ、Codexを毎回呼ぶ必要はない。Git commit／pushと作業ロックも既存手順を使う。

対象はmanga-discovery-v2のTask1レビューschemaVersion=1。旧手動レビューの任意形式や未解決例外を自動変換しない。例外解決は別レビュー、公開base更新後の再統合は新状態に対する判断が必要。既受入だけの集合を別baseへ再構成する専用モード、GitHubの承認者認証連携・電子署名・他adapterは未実装。GitHub承認記録からの自動起動と定期確認は、後続の[収集Worker](COLLECTION_WORKER.md)で追加した。公開apply／restore／VPS配置／会員DB変更は実装に含めない。

### タスク2の検証操作

既存の共通ロック内で、Node24をPATHへ設定して実行する。

```bash
python3 -m unittest discover -s tests -p test_collection_acceptance.py -v
python3 tests/check_collection_acceptance_cli.py
```

後者はローカル公開KGへのbackup／planだけを使う明示実行の試験。r0003凍結成果から当時のr0002既受入集合を比較入力とする隔離レビューを作り、萩尾望都の2 Claimを模擬判断で選択する。判断・受入・releaseはすべて一時ディレクトリへ保存し、終了時に削除する。実運用のr0003正式受入や公開候補を追加・変更するコマンドではない。模擬判断を実際の人間承認として報告しない。

レビュー・元ジョブ・公開／既受入参照資料の内部や上位ディレクトリを出力先に重ねる指定は、排他用.lockの作成より前に拒否する。判断ファイルはレビューbundleの外へ保存する。人間判断ファイル・完了ジョブとその凍結根拠が利用できる作業環境で実行し、別環境への自動同期や遠隔起動は行わない。


### タスク2の検証結果（2026-10-18）

[検証記録](../../datasets/manga-collection/acceptance-workflow-validation-20261018/README.md)と[実CLI結果](../../datasets/manga-collection/acceptance-workflow-validation-20261018/readonly-cli.json)を保存した。

- Task2単体16件、既存の収集／adapter／r0003レビュー・受入61件、公開／ORIGINAL_STORY／旧release24件を検証した。明示承認不足、hash・本文・Role／scope改変、依存／支持根拠の欠落、UUID・外部ID・同一意味・Source／Citationの衝突、base／revision競合、release ID再利用、日時改変、凍結資料への出力を拒否する。
- 部分受入、同定のみ、validate／planの失敗からの再開、受入日時・releaseの不変を確認。release作成前の中断でも受入inventoryを照合し、旧日時へ改変しない。使用済みrelease IDは新規受入記録を保存する前に拒否する。
- 実CLI一回で模擬3 Entity・2 Claim・2 Source・2 Citationの受入→release→validate→ローカル無書込planまで成功。r0002既受入9 Claimと合わせた追加は16 Entity・11 Claim・9 Source・11 Citation・16 ExternalIdentifier。planは63知識Node・60 Relationship追加、既存更新0。
- 同じCLIの再実行は受入記録・release不変、validate再利用、plan再取得。前後backupの保存時刻以外の全payloadをhash比較し、公開release／revision・全知識・外部ID UUID・receipt／identity／撤回履歴と過去成果inventoryの不変を確認した。全模擬受入・releaseは一時領域だけであり、実運用への新規正式受入はない。
- 並列時に旧比較試験1件の既存5秒timeoutと、通し試験側の240秒timeoutが出た。重い試験を直列化し、通し試験側の上限600秒・自分の子process groupの終了処理で再確認した。collectorの通信上限や旧承認は変えず、最終通し試験は295.4秒で成功。
- ローカル3200・ベータの/api/datasetは200、公開revision 82b01515-594c-48ca-b4b6-515eefac83caを維持。Web／API／DB schemaの変更がなく、再build・配置は不要。公開apply・restore・VPS配置・会員DB変更は実行していない。

受入済みcandidateが将来の公開baseになった場合の追加集合再利用も、r0003ファイルによる仮想状態で検証した。実際のpublic:backup／planの基準は引き続き現公開20261014-credits-001であり、未適用候補を現在の公開状態に読み替えていない。

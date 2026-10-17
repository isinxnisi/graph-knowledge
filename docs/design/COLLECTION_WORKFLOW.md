# 収集実行から受入レビューまでのワークフロー

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

タスク2のaccept-releaseは未実装。次は、decision-requestの対象ID／scope／参照hashへ実際の人間判断を結び付けて、既存形式の受入記録→受入済みだけの新release→validate→最新base／revisionへのplanを連結する。現在のレビュー生成結果を自動受入記録へ変換せず、public:apply／restore／Web配置をラッパーへ含めない。部分受入、identity-onlyの扱い、hash改変、base競合、再試行時の日時／release ID不変を検証する。

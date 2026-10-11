# 共通KGのrelease適用

2026-10-11採用。公開準備の[24ステップ](../PUBLIC_BETA_PROGRESS.md)の2〜6。凍結seedの変更ではなく、安定dataset `public-kg` 専用の追加・表記訂正・明示撤回・復旧経路。

## 領域・生成・由来

- dataset IDは版更新でも `public-kg` のまま。release IDを別管理し、`baseRelease` が現在版と一致する時だけ適用。初回は `20261011-001` / base=null。
- 漫画v2＋Event v1（科学v2を含む）の受入済み入力から構成。demo・未受入研究台帳は含めない。新規事実の受入やSource評価は行っていない。
- Entity/Claim/Source/Citation UUID、外部ID、期間、三typed限定、原表記・locatorは元のまま。各Claimの元dataset/元UUID、入力台帳・manifest・生成物hashをmanifestへ記録。取込由来とClaimを支持するSource/Citationは別。
- 同ID同内容は一件、同ID異内容と外部ID衝突は拒否。同名や同一SPOだけでは統合しない。科学の重複コピーは初回入力から避ける。別分野をつなぐ未確認Claimは作らない。
- 元の台帳・raw資料・言語・同一性判断は入力版に保持する。生成物の単一name/aliasesだけで多言語名称モデルが完成したとはしない。
- 初回は18 Entity / 27 Claim / 15 Source / 29 Citation / 16 ExternalIdentifier =105知識Node、128 Relationship。DisplayRelationは19。二分野は同一DBに存在するが、未確認の横断接続はない。

## manifestと適用契約

`datasets/public-kg/releases/<release>/data.json` はfixture schema v4。manifestはdataset/release/baseRelease/reason/dataSha256/inputs/claimOriginsを持つ。全体snapshotを期待状態として扱い、暗黙の削除を拒否する。差分patch言語や汎用import基盤は作らない。

1. `public:prepare` は初回の凍結入力を各専用loaderで検証し、決定的に生成する。
2. `public:validate` は初回の生成一致、hash、schema、ID/参照/kind/日付/限定、demo非混入、全Claimの由来を検証。後続版は `-- <directory>` でartifactを検証する。hashは改変検知であり、資料受入の証明ではない。
3. `public:plan` はDBを変更せず追加Node/訂正Node/追加Relationshipを返す。DBの現在版・fingerprint・過去release IDも確認。無印の非空DBは取得しない。
4. `public:apply` は入力検証と事前確認後に制約を追加し、DatasetStateをロックして再確認、全データを一transactionで適用。途中失敗はrollbackする。schema制約の追加はNeo4jの都合で別transaction。
5. 同release同内容の再実行は無変更。既存release IDの別内容、違うbase、DB直接変更によるdriftを拒否。同baseの同時更新は一方だけ受理する。
6. Entityのkind/createdAt、既存Claimの命題・肯否・期間・限定、既存接続は変更不可。visibilityは下記の明示撤回に限りpublished→hiddenを許可する。意味訂正は新UUIDの差替えとする。

表記訂正はEntityのname/aliases/description、Source書誌、Citationの記載訂正を想定する。資料支持や受入意味を変更する時は機械検証だけで承認済みにしない。新規Claimにも受入済み入力とoriginを必要とする。現在のCLIはoperator向けで、AIや一般ユーザーの自動受入APIではない。

DatasetState（現在版・Graph fingerprint）とDatasetRelease（適用理由・hash・日時）を運用メタデータとして保持。KGをPGへ二重管理しない。初回DB全体では知識Node105＋メタデータ2=107 Node、Relationship128。後続版ではreceiptが増えるので知識件数とは分ける。

## ローカル環境

専用Compose/.env.public、Bolt7694 / Browser7481、Web3200、build directory `.next-public`。同じ既存API/画面を利用し、探索の意味モデルは維持し、publicだけ更新識別子と撤回情報を返す。検索・開始例から漫画/科学/Eventを選べる。

public接続はローカル専用7694、一時統合DBは7695。凍結datasetとのportguardは双方向に維持。既存 `db:seed` はpublicを拒否する。通常の凍結seedを緩めない。step7では明示的な本番markerと専用Compose内部接続だけを追加した。[本番配置と検証状態](PRODUCTION_DEPLOYMENT.md)を参照する。

## 明示撤回・差替え（step5）

後続manifestに任意の `withdrawals: [{claimId, reason, release, replacementClaimId:null|UUID}]` を持つ。全期待snapshotに撤回済みClaim・Citation・Sourceを残し、対象Claimのvisibilityだけhiddenへ変える。省略時に空配列を自動挿入せず、初回manifest/receiptのhashを維持する。

- 新規撤回は現DBのpublished Claimに限り、撤回releaseは今回のreleaseと一致させる。理由を必須とする。理由は運用上の撤回理由でありdenied Claimではない。
- 差替え先は今回追加する別UUIDのpublished Claim。元ClaimのSPO・肯否・期間・限定・接続を書き換えない。新Claimにも由来が必要。循環する差替えを拒否する。
- 既存撤回記録の理由・差替え先・releaseを黙って変更せず、再公開もしない。差替え先がさらに撤回される場合も各履歴を保持する。全manifestへ既存撤回を引き継ぐ。
- `Claim.withdrawalReason / withdrawnInRelease / replacementClaimId` は公開KGの運用属性。fixture v4やPredicate/三限定の意味は変えない。
- neighbors/overview/relatedはpublishedのみ。`GET /api/claims/{id}` はpublicの明示撤回済みに限り旧内容とCitation/Source、`claim.withdrawal={reason,release,replacementClaimId}` を返す。通常のhiddenを公開する変更ではない。旧閲覧リンク・会員保存UUIDを差替え先へ自動転送せず、撤回状態と明示リンクを表示する。保存Capsuleでは旧参照と根拠を残し、現在の関係線には撤回Claimを混ぜない。出典書誌等は現在の訂正値であり、旧リンクだけで当時のSource全文snapshotを復元する意味ではない。
- 今回、実在Claimを撤回する新しい事実判断は行わない。配布初回releaseは不変。撤回・置換のデータは隔離DB/ブラウザ応答の検証だけ。

## 更新識別子・cursor・探索（step5）

DatasetStateに `revision` を置く。実変更とrestoreで新UUID、同release再適用では不変。step4の既存DBは書換え不要で `legacy:<release>` を識別子に使う。releaseを戻してもrevisionは戻さない。

- `GET /api/dataset` は `{dataset,revision}`（凍結版はnull）。publicのneighbors/Claim応答へrevisionを追加する。通常APIの5秒制限は維持する。
- publicのcursor v5はdataset/center/正規化した三限定を含む条件/after/revisionへ結合。旧版cursorは409 `DATASET_CHANGED`、対象・条件不一致や旧UUID形式等は400。凍結版のcursor契約は変更しない。
- publicのneighbors/Claimは任意query `revision` を受け付け、取得開始と終了に現在版を確認する。ページなしの新しい枝も版を指定する。検索はGraphを変更せず、候補選択時に新しい探索を作る。
- GraphState・一件snapshotはrevisionを保持。並行応答の初回版が異なる場合もmerge前に拒否する。条件変更・起点変更では受理ページ/旧cursor/通信を新世代へ持ち越さない。
- 更新検知時は旧Graphを保持して通知し、進行中通信と追加取得を止める。「更新データで探索を読み直す」で同じ起点・確定条件から再取得する。旧枝/選択/座標を新データへ無条件に再適用しない。Claim詳細の409からも同じ通知へ進む。
- publicの閉枝再開と直前探索復帰は軽量のrevision確認後にだけcacheを復元する。失効した直前探索は破棄し、現在の新Graphは保持。一時的な通信失敗では復帰候補を保持する。凍結版のcache再開/復帰には新しい通信を増やさない。
- 永続した探索途中は従来どおり古いClaim/cursorを保存・再利用せず、現データから再構築。再構築中もrevisionを一つへ結合し、途中の更新では部分Graphを適用しない。public Capsuleの再閲覧も一つのrevisionで取得し、途中更新を黙って部分表示しない。

常時pollingや更新pushはしない。画面を開いたままなら、次の追加取得・詳細取得・cache復帰時に更新を検知する。概要モーダルは従来どおり「現在登録されている範囲」の独立集計で、旧Graphのsnapshotではない。

## KGだけのbackup/restore（step6）

`public:backup -- <file>` は現在KGをfixture v4へ逆変換し、撤回、ExternalIdentifierのNode UUID、全release receipt、現在版/fingerprintと復旧で保持したID指紋をchecksum付きJSONへ保存する。未知属性や不正接続を失わず復元できない場合は作成を拒否する。backup中のrevision変化も拒否し再試行する。既存ファイルは上書きせず0600で作る。`backups/` はgit対象外。

`public:restore:plan` / `public:restore` は期待する**対象DBの現在revision**（空DBなら `empty`）を環境変数 `PUBLIC_RESTORE_EXPECTED_REVISION` に必須指定する。checksum/schema/参照/三限定/日付/撤回/fingerprint/外部ID/receiptを検証し、無印非空DBや別dataset、drift、版競合を拒否。planは無書込。

復元ではDatasetStateの同じロックを取得して再確認し、既知KGの5labelと接続だけを一transactionで置き換える。途中失敗はrollbackする。Neo4j schema制約は従来どおり別transaction。ExternalIdentifierを含む内部UUIDを復元し、backupより後のrelease receiptも捨てない（使用済みrelease IDの再利用を防ぐ）。復旧前KGとbackupの `DatasetIdentity`（Node IDと不変部分のhashだけ）を保持し、復旧で消えたClaim UUIDの別命題・別Node型への再利用も拒否する。Claim本文は複製せず、ClaimではSPO/肯否/期間/限定/createdAt、Citationでは所有Claim/Source接続、外部IDでは所有Entityの接続等を指紋にする。Entity表記やSource書誌の訂正を新しい意味へ自動判定するものではない。利用できる現在DBとbackupにない過去履歴まで復元する保証はしない。現在release/fingerprintを戻し、新revision、復元日時、backup checksumを運用記録へ残す。

PostgreSQLへ接続せず、会員・Capsule・共有・会話は復元しない。元の参照が復旧後KGに無ければ従来の参照不能表示で扱う。会員データをKGと同時点へ巻き戻す契約ではない。

これは既知schemaの論理backup。Neo4j全体の物理dump、任意schema移行、PG backup、外部資料ファイルのbackupではない。元台帳・raw・release artifactは別途保持する。checksumは改変検知であり受入や信頼性の証明ではない。復元前に現在KGもbackupし、実行中の更新作業を止めてplanを確認する。本番定期backup/外部退避/retention/readinessは7/19で運用へ接続する。

## 未完了・運用制限

- VPSの単一本番構成・HTTPS、実Google、公開書込の運営操作、数千規模試験は残作業。ローカルの更新・復旧だけで公開準備全体の完了にしない。
- 本番構成と接続guardは追加したが、VPSの管理者初期設定と実起動／HTTPS検証は待ち。ローカル成功をVPSの成功と扱わない。
- 凍結pilot参照を共通KGへ自動移行しない。今回も元の6datasetと初回公開releaseの内容は変更していない。

## 検証記録

2026-10-11、Node24.15.0（環境に導入済みの版。repoの指定は24.21.0）、Neo4j5.26.31-communityで確認。

### step1〜4

| コマンド | 結果 |
| --- | --- |
| `npm run public:prepare` / `public:validate` | 受入済み入力から生成一致、18/27/15/29/16。凍結版のhash/受入検証も成功 |
| `npm run public:plan` | 空DBへ105知識Node・128 Relationshipの追加を提示、無書込 |
| `npm run public:apply` を2回 | 初回105知識Node・128 Relationship、2回目追加0・更新0・Relationship追加0 |
| `npm run public:integration` | 一時DB7695で6件成功、終了後container破棄 |
| `npm test -- --maxWorkers=1` | 26ファイル・530件成功（共通KG単体7件を含む） |
| `npm run typecheck` / `npm run lint` | 成功。語彙の既存warning1件は意味変更せず維持 |
| `npm run public:build` | 本番build成功 |
| `GRAPH_TEST_REUSE=1 npm run public:e2e` | `public:start`の本番buildで2件成功 |

実DB6件はdry-run無書込、全属性/接続/外部ID/メタデータも含めた再適用一致、Entity訂正と新Claim/Citation追加、意味変更/暗黙削除/base違い/版ID再利用/drift拒否、途中制約失敗rollback、同baseの同時更新、別datasetの非空DB拒否を検証した。合成の追加は一時DBのテストだけで、配布releaseには入れない。

実ブラウザではPLUTO開始→検索候補取得だけではGraph不変→Heisenbergの組織立場と概要→Event開催期間→Lorentz選択→広く見る→直前復帰→集約線から広い参加/CHAIR/仏語Président/Sourceへ進んだ。四kind検索、三限定のpredicate限定適用、架空demoの非混入も確認。

PLUTOのGraphとEvent概要の2画面を1440×1000で目視確認。共通の開始例・dataset表示・制作役割badge・特定開催回と参加者の向きが同じ画面で読める。スクリーンショットは作業用test-resultsのみで、凍結データや履歴へ大量追加しない。

初回はDB起動・devコンパイル・検証を同時実行して既存テストの5秒timeoutとAPI503が出た。重い検証を直列化し、通常530件と本番buildのブラウザ試験で再確認した。利用者APIの5秒制限は変更していない。一時DBの全件比較は更新検証用60秒枠へ分離した。新規テストのCytoscape戻り値/変数名の不備も修正して再実行した。稼働開始時の負荷とreadinessは本番構成・性能工程でも確認する。

既存demo・漫画v1/v2・science v1/v2・Eventのファイルは変更なし。元DBへseedや削除をしていない。VPSは読み取り調査だけで、リモート設定・認証情報・広告配信は変更していない。

### step5〜6

| コマンド | 結果 |
| --- | --- |
| `npm run public:validate` | 初回releaseの再現・凍結入力検証成功、18/27/15/29/16のまま |
| `npm run public:integration` | 隔離Neo4j7695・PostgreSQL55433で11件成功、終了後container破棄 |
| `npm test -- --maxWorkers=1` | 26ファイル・543件成功 |
| `npm run typecheck` / `npm run lint` | 成功。既存の語彙warning1件を維持 |
| `npm run public:build` | 本番build成功 |
| `GRAPH_TEST_REUSE=1 npm run public:e2e` | 本番buildで4件成功 |
| `npm run public:backup -- backups/public-kg-20261011-step6.json` | 稼働用ローカルKGのbackupを0600で作成（git対象外） |
| `PUBLIC_RESTORE_EXPECTED_REVISION='legacy:20261011-001' npm run public:restore:plan -- backups/public-kg-20261011-step6.json` | 無書込plan成功、105知識Node。稼働用KGの実restoreはしていない |
| `git diff --exit-code -- datasets fixtures` | 凍結6datasetと配布初回releaseは変更なし |

実DBでは、明示撤回/差替え後の旧Claimと根拠、通常hiddenの404、publishedだけの探索/集計、初回枝・続きcursorの409、撤回を含むbackupの空DB復元を確認した。KGだけの復元前後で全知識属性・接続・ExternalIdentifier UUIDが一致し、backup後に追加したPGの保存行も不変だった。これは分離した実PGの保存レコードによる確認で、会員本番環境の災害復旧訓練ではない。checksum改変/別dataset/版競合の拒否、途中制約失敗の全rollback、receipt維持、復旧後のClaim UUID別命題/別Node型への再利用拒否と指紋の次backupへの継承も検証した。

unitでは古いページのmerge拒否、更新時の通信破棄/明示再取得、閉枝/直前探索の版確認、遅い旧応答の除外、途中保存の再構築中の版混在拒否、Capsuleの撤回参照保持と現在線からの除外、読取batchの版競合、旧リンクの理由/Source/差替え先を確認した。凍結版にはrevision確認通信を追加していない。

ブラウザではPLUTO→Heisenberg→Event→Lorentzへの起点切替/復帰/Source確認と三限定を回帰確認。追加取得の409では旧Graphを保持し、明示操作で同じ起点/条件を読み直す。旧Claimリンクでは理由・元の命題・参照資料・明示差替え先を表示する。撤回/409の画面テストは応答差替えだけで、受入済み実在Claimを本当に撤回したものではない。1440×1000の2画面を目視し、更新通知の重複を解消した。旧参照は差替え先へ自動移動しない。

実DB検証で、撤回の有無をCypherのproperty存在条件で絞った時に、返却mapの理由/releaseが文字列として取得できない不具合を検出した。DBにある理由文字列が不変であることを別queryで確認し、ID検索後にアプリ側で公開状態と撤回属性の型を検証する経路へ修正した。通常hiddenを返さないこと、理由/releaseの正確な返却、backup復元後の返却を同じ回帰ケースで確認した。ブラウザ確認では直接参照画面に差替え先リンクが出ない不備も直し、会員参照の表示境界にも反映した。

ローカルWeb3200と既存3210〜3215を起動状態で引き渡す。今回はVPSへの書込や既存6DBへの投入をしていない。本番接続・定期退避・実運用の復旧は7/19の残作業。

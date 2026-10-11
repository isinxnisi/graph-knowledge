# 共通KGのrelease適用

2026-10-11採用。公開準備の[24ステップ](../PUBLIC_BETA_PROGRESS.md)の2〜4。凍結seedの変更ではなく、安定dataset `public-kg` 専用の追加・表記訂正経路。

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
6. Entityのkind/createdAt、既存Claimの命題・肯否・期間・限定・visibility、既存接続は変更不可。Claimの意味訂正は同UUID上書きでなく、次の明示差替え契約で扱う。

表記訂正はEntityのname/aliases/description、Source書誌、Citationの記載訂正を想定する。資料支持や受入意味を変更する時は機械検証だけで承認済みにしない。新規Claimにも受入済み入力とoriginを必要とする。現在のCLIはoperator向けで、AIや一般ユーザーの自動受入APIではない。

DatasetState（現在版・Graph fingerprint）とDatasetRelease（適用理由・hash・日時）を運用メタデータとして保持。KGをPGへ二重管理しない。初回DB全体では知識Node105＋メタデータ2=107 Node、Relationship128。後続版ではreceiptが増えるので知識件数とは分ける。

## ローカル環境

専用Compose/.env.public、Bolt7694 / Browser7481、Web3200、build directory `.next-public`。同じ既存API/画面を利用し、新しいAPI契約や意味モデルは追加しない。検索・開始例から漫画/科学/Eventを選べる。

public接続はローカル専用7694、一時統合DBは7695。凍結datasetとのportguardは双方向に維持。既存 `db:seed` はpublicを拒否する。通常の凍結seedを緩めない。本番接続はstep7で明示設定する。

## 未完了・運用制限

- 明示撤回・置換先記録・旧参照の表示はstep5。現時点では削除/visibility変更を拒否する。保存した旧pilot参照を共通KGへ自動移行しない。
- releaseとcursor/探索世代の結合もstep5。**現在はWebを停止し、適用後に新しく探索を始めるローカル作業に限定する**。稼働中更新・旧Graphの完全継続を約束しない。
- backup/restoreとKGのみのrollbackはstep6。DatasetRelease receiptはbackupではない。会員PGをKGに合わせて巻き戻さない。
- 本番deploy/HTTPS、実Google、公開する書込機能・問い合わせ、データ拡充は残作業。初回共通KGだけで公開準備全体が終わった扱いにしない。

## 検証記録

2026-10-11、Node24.15.0（環境に導入済みの版。repoの指定は24.21.0）、Neo4j5.26.31-communityで確認。

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

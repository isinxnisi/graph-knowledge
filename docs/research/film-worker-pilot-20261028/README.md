# まとまり1：固定Workerの映画互換と保存候補の受入準備

> 2026-10-28更新：固定対象2件への運営者承認を受け、Worker5ファイル更新と34 Claimの正式受入、release候補・offline／root実plan・delivery登録まで完了した。[次の個別公開承認](PUBLICATION_APPROVAL_REVIEW.md)／[最新状態](FORMAL_ACCEPTANCE_STATUS.md)。以下はcommit e2776c49時点の判断前資料として保持する。

2026-10-28。設計レビュー `8380f312` 第9章の実装・検証結果。main基準は `129c1eb411cece336cce02996c520f8f21b12f0a`。mainへの統合、稼働Workerへの更新、正式受入、公開は実施していない。

## 判断できる固定対象

| 対象 | 固定対象 | 現在の状態 |
| --- | --- | --- |
| Worker互換更新 | source `089ee51922d68b03f2e8a9029a3811babfc3dc67` の5ファイル。overlay manifest `68b62c2f93704d8f82b93f0ac2dc6cc94e020c7802edd0a16e8ace5651f44d0e` | 隔離検証済み、未導入 |
| 映画受入判断票 | [formal-decision-draft.json](formal-decision-draft.json)、SHA-256 `153830c9413b9d1368939b67289126a5e6dde5bc275cc2bcdfa31bdb5881f51a` | 34 Claim・29新Entity・5新Source・34 Citation、未承認 |

判断する内容は [CANDIDATE_REVIEW.md](CANDIDATE_REVIEW.md)、Workerの固定差分・既承認依頼の一覧は [worker-update-candidate.json](worker-update-candidate.json)、次の操作は [OPERATOR_ACTIONS.md](OPERATOR_ACTIONS.md)。受入判断票の人間判断欄はnullのまま、全環境のapply権限はfalse。公開署名を含まない。

## 固定Workerの最小互換修正

稼働Workerのconfigは `973c7b0c599f79905a029b28b524f4924e169376`。実配置には既にcollection-issues／worker／workflow／transportの4ファイルのbackportがある。そのbytesを `d0b62e7b7a33dc8a5e5257b8504f8ab5494854c5` として記録し、その上に以下の既存main実装だけを載せた。新しい語彙読込機構やRole定義は追加していない。

- `lib/domain/contribution.ts`：DIRECTING／ACTINGを含む閉じた型・parse。
- `lib/domain/role-vocabulary.ts`：正式10 Roleの整合検証。
- `lib/i18n/contribution.ts`：既存の映画Role表示名。
- `vocabulary/contribution-roles/catalog.json`、`reviews.json`：既存の正式定義・承認記録。

既存8 Roleの定義・承認行は同一。collector実行hashは `80e05b67bc0129b963653b90df4cfbfa5bd6aff190acda99f54c08541e55801e` のまま。このhashはcollection-themes／collect-manga／collect-manga-v2の3ファイルを束縛する値であり、単独ファイルのSHAとは異なる。

推奨する導入方法は、**現行base pinを保持した、明示承認付き5ファイルbackport**。候補source commitは内容を取得する参照であり、config.codeCommitをそのSHAへ変える指示ではない。Worker ID、coordinatorのcodeCommit、VPS receipt-peer、control branch、既存依頼を維持できる。

実際の `Executor.sync_inputs` でも、973の既存sourceを許可し、無関係な最新mainや未統合の候補sourceへの差替えを拒否した。guardの緩和は不要。全runtime置換を選ぶ場合は、候補のtrusted mainへの統合、coordinator／VPS peer／未署名ticketの固定tuple再確認が別途必要になる。今回はその方式を採らない。

既存38依頼は24完了、12過去blocked、2技術復旧待ち。recipeを持つ旧依頼は旧漫画base `20261014-credits-001` を固定しており、映画入り公開baseへ書き換えない。#47／#50は取得技術の復旧待ちで、Role修正だけで解消したとは扱わない。過去blockedの再実行・予算復活・sourceCommitの付替えは今回行わない。

## 実際に通した経路

| 検証 | 結果 | 限界 |
| --- | --- | --- |
| 旧schemaで映画入り累積baseを検証 | roleIdの2箇所（claims[370]／[536]）で拒否を再現 | 不具合の対照実験 |
| 候補Worker＋映画入りbase＋映画を含む11 receipt＋漫画追加 | 実collect-review、再実行、decision-template、既存coreの選択・merge、CLI validate、offline planが成功 | 完了済み原哲夫／蒼天の拳jobの保存cacheを使用。通信追加0、正式受入0 |
| 旧8 Role・null／ISBN scope、旧base | 成功。既存定義・承認行を保持 | Webの再配備は対象外 |
| 未知Role／未知scope | 拒否 | enumを任意文字列にしていない |
| 実Executorのsource guard | 既存973を許可、無関係main／未統合候補sourceを拒否 | remote transportだけローカルGitに置換 |
| 映画manifestの34 Claim | 既存fixture schema、CLI validate、fresh backupに対するoffline plan成功 | 未承認の隔離候補。DB接続・本番plan／applyなし |
| 未承認票の受入試行 | coreが拒否、receipt新規0 | 人間判断を代用しない |

漫画追加のplanは1 Claimを含む5 node・5 relationship追加、既存更新0。映画34件のplanは131 node・165 relationship追加、既存更新0。公開済み全Claimの本文は同一、映画の既公開2件は選択集合から除外した。

単体・回帰検証はmanifest8件、既存film collector16件、film dispatch3件、production2件の計29件成功。検証出力は [results](results/verification.json) に保存。検証中に見つかった新規timestampの非UTC形式は、既存schemaに合わせてZ形式へ修正した。旧受入データを正規化・書換えしていない。過去のdispatchテストが稼働receipt増加に依存していた問題は、参照された歴史的10 receiptだけを一時領域へ固定して解消した。

## A/B全件と残りの追跡

| 群 | 全件 | 提出可能 | 不足根拠 | 同一性判断 | 今回の扱い |
| --- | ---: | ---: | ---: | ---: | --- |
| A：DIRECTING／ACTING | 37 | 15 | 21 | 1 | 原役割・実演文脈を点検 |
| B：SCRIPT_WRITING／PRODUCING | 26 | 19 | 7 | 0 | 固定定義の映画への適用判断を要求 |
| C：新Roleの意味判断 | 12 | 0 | — | — | 全件保留台帳へ維持 |
| D：新関係構造 | 4 | 0 | — | — | 全件保留台帳へ維持 |

不足根拠28件の多くは原役割見出しや役柄の未転記であり、資料・根拠の不存在ではない。保存した人物・作品・担当の照合を維持し、必要部分だけ補えば再提出できる。1件の同一性判断はDuneのTimothée Chalamet。公式「ティモシー」と保存label「ティモテ」の対応をQIDだけで決着させず保留した。

保存済み資料を再利用し、既存6資料の短い原役割表記・必要な役柄23件だけを補足した。全頁本文や画像の新規収集はしていない。SourceはURL同一性で再利用し、既受入Source本文を変更しない。旧URLが取得できない場合も根拠不存在へ変更していない。

全124候補＝公開済み2＋照合済み未収録79＋構造化候補37＋研究保留6。79＝提出可能34＋今回未提出45（A/B29＋C/D16）。**正式受入は今回0のため、未収録数は79のまま**。全97 Entity候補は既存正式3 UUIDを保持し、残り94を全件追跡。94のうち29を今回の新規UUID確定判断へ提出し、65は未提出（人物名判断1を含む）。同一性の正式承認は捏造していない。

[all-candidate-audit.json](all-candidate-audit.json) に124記録・97 Entityの対応を全件保存。提出34件が通るまで他の45件を捨てたり、逆に全79件が揃うまで提出を止めたりしない。次は残るA/B28件の短い未転記部分と人物名1件を別集合で補い、C/Dの意味・構造判断は混ぜずに回収する。

## 候補manifestと既存受入契約への接続

`film-saved-manifest-v1` は対象候補ID、保留ID、未着手ID、公開済み除外IDの全件被覆を必須にする。保存候補・資料照合・補足事実・比較base・既存Role定義をhashで固定し、候補ID→Claim UUID、Entity対応、Source／Citationを決定的に再生成する。任意Role、新しい映画scope、期間限定の推測、未知の取得adapterは許可しない。

既存 `film-review`／`film-production-review`／`accept-film` のcoreへ接続した。B群には `roleMappingDecision` のstatementと対象19 Claimの一致、Entityには `identityDecision` と新29 UUIDの一致を要求する。今回の票は双方nullであり、承認記録ではない。全Claimはhiddenの提案、肯定、人物→作品、period両端null、scope null。nullは未構造化を意味し、全cut・全地域・全言語へ保証を広げない。

## 最新本番照合と保管場所

運営者が読み取り専用exporterで取得したbackupを独立検証した。

- SHA-256：`c914fb71d0dd3953ea6f5be90603f8de4da137addaa8eaf548c8d632436669ae`
- release：`publication-film-initial-20261027`
- revision：`7c54da24-6fa9-46a5-810d-834eed8328d9`
- 2178 Entity／1897 Claim／1797 Source／1934 Citation、既存validator成功。
- 本番 `/api/dataset` のrevisionも一致、全11正式receipt・根拠参照bytesを照合。

判断票を将来の正式receiptの相対参照契約へ接続できるよう、Worker data rootの `datasets/film-collection/ab-manifest-20261028/` に**未承認のtrial／review／入力snapshotのみ**を作成した。作成中だけ既存worker.lockを取得し、処理後解放した。Workerのコード・config・state・依頼・receipt・実行予定には書いていない。backup全体はGitへ含めない。

正式判断用は [formal-review](formal-review/context.json) と [formal-decision-draft.json](formal-decision-draft.json)。`productionAcceptanceReady:true` は最新backupとの技術的な照合状態であり、人間の承認や本番適用権限ではない。旧 [review](review/context.json)／[decision-draft.json](decision-draft.json) はoffline準備段階の記録で、承認対象には使わない。

次に確認できるのは専用worktreeのCLI受入準備環境。3200／beta／本番Webは変更なし。本番KG・VPS・会員DB・既存Issue・収集承認・control branchにも変更なし。

## 再検証

Nodeは既存24.15.0を使用。例は専用worktreeで実行する。新しい出力先を指定し、既存の固定成果物を上書きしない。

~~~bash
python3 -m unittest discover -s tests -p 'test_film_manifest.py' -v
python3 -m unittest discover -s tests -p 'test_film_collection.py' -v
python3 -m unittest discover -s tests -p 'test_collection_film.py' -v
python3 -m unittest discover -s tests -p 'test_film_production.py' -v
python3 scripts/test-worker-film-compat.py --output .local/film-worker-compat-recheck
python3 scripts/test-worker-film-source-guard.py --home .local/film-worker-compat-recheck
~~~

Worker probeは導入元の保存済みjob／receiptを読み、隔離コピーだけを変更する。production票の再作成は [prepare-film-production-manifest.py](../../../scripts/prepare-film-production-manifest.py) の `--help` を参照する。既存pending票を上書きしない仕様。正式受入前には公開revision・全receipt・program bindingを再検証し、変化した場合は旧承認の付替えで済ませない。

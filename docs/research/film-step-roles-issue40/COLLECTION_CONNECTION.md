# 映画データを収集・受入へ接続する変更一覧
状態：実装準備の提案。映画収集ジョブ、テーマ承認、正式受入、公開release/applyは今回実施していない。漫画Worker、manga-discovery-v2、control branch、過去の承認・receiptは無変更。

## 現行mainとの差分
人物→作品CONTRIBUTED_TO、独立Claim、Source/Citation、役割原文、null scope、UUID・外部ID、公開revision、全段存在判定、証拠再照合は再利用できる。監督／演技出演は正式Role enumにない。publication scopeはISBN向けで、film-cutへ拡張する判断は未採用。研究用CANDIDATES.json／今回fixture.jsonはimport形式ではなく、checked-source-candidateは正式受入ではない。

既存reviewは漫画v2だけを受け付け、providerの作品型確認・書誌対応・原責任表示確認が漫画固有である。映画を同adapter名のまま流すと、映画型の不合格又はISBNへの誤対応になる。候補ファイルの置き場所を変えるだけでは接続できない。

## 最小の次段階
初回は3作品・今回の経路を成立させる少数Claimに限定した、手動起動の film-discovery-v1（仮称）を別契約にする。既存漫画v2へ分岐を埋め込まない。自動Workerへの組込みは候補→review→個別受入が実証できた後の別段階。

| ファイル／境界 | 必要な変更・検証（今回未実装） |
| --- | --- |
| lib/domain/contribution.ts、lib/i18n/contribution.ts、vocabulary/contribution-roles/{catalog,reviews}.json | 意味審査後にDIRECTING/ACTINGを同時登録。baseline・旧approved票は不変。全Role比較と前後hashを照合 |
| 新 scripts/collect-film-v1.py、datasets/film-collection/... | 保存済みsnapshotを入力にできる独立recipe・collector。初回はoffline。新規通信は別の範囲／利用条件／予算承認 |
| scripts/collection-themes.py の定義validation・plan・dispatch | 新adapterの固定入力inventory、code/input hash、上限をallowlist化。漫画のcode hashにはgate本体も含まれるため、共通gate改修が既存承認を無効化する影響を事前に計画。旧承認を上書きしない |
| scripts/collection-workflow.py の verify_job / review_job / collect-review | 漫画専用チェックを残し、映画reviewの明示dispatchを追加。自動的な汎用化やadapter未指定fallbackをしない |
| scripts/collect-manga-v2.py | **変更不要**。既存ISBN・NDL・漫画型・原責任表示の契約を維持 |
| lib/domain/fixture.ts、lib/server/public-dataset.ts、lib/server/mappers.ts | 作品単位・null scopeなら既存構造を再利用可能。新Role登録後のvalidation regressionが必要。cut限定が必要なら別設計が先で、nullで隠さない |
| scripts/collection-acceptance.py | artifact/record/hash・人間decision・UUID単位選択は再利用。review dispatchを拡張した場合は映画jobの由来を検証。受入validation cacheは現状public-dataset.tsとfixture.tsのhashに依存し、importされたcontribution.tsやRole catalog変更を直接束縛しないため、映画対応時には推移的schema・語彙版のhashも含める |
| scripts/collection-sequence.py、collection-evidence.py、collection-inventory.py | 新adapterのartifact形式を読めるかfixtureで確認。受入済み未公開・既公開・撤回済みを別状態のまま重複判定 |
| scripts/collection-worker.py、control branch、承認registry | 今回も初回手動実証でも変更しない。後日、自動運転を選ぶ場合だけ新能力・definition/code hash・通信予算を明示審査 |
| lib/analysis/collection-connectivity.ts、scripts/collection-connectivity.ts | 既存連結評価を参照し、映画sidecarで検索版・段別Role・fixture hashを指定した差分評価を追加。Issue #34固定入力を映画のadapterと扱わない |

## 候補→reviewの最低情報
- 同定：work/personの型、原題・邦題・別名、国／言語、作品年、QID及び資料固有ID、資料が指すcut／公開地域。年一致だけで同名映画を統合しない。映画・シリーズ・小説・リメイクを別Entityとして確認する。
- 根拠：固定snapshot/revision、Source URL・提供者・利用条件・取得日・hash、対象作品／人物／役割の対応、原役割語・言語・locator。短い見出しだけなのか個人クレジット原文なのかを明記する。
- Claim：canonical人物→作品、採用済みRole一つ、肯否、確認できたscopeとperiodのみ。元Wikidata statement/qualifier/referenceは由来sidecarに残す。P57/P161の列挙を独立支持資料数にしない。
- 同一性・重複：Entityは確認された外部ID対応を優先。Sourceは正規化URLと版、Claimは人物・作品・Predicate・Role・scope・period・肯否、CitationはClaim/Source/支持箇所を比較。広いClaimを限定Claimへ変更しない。同一人物の監督と出演は統合しない。
- 保留：版依存、声／吹替／archive、credit未記載、集約表記、作品誤同定、矛盾、原役割語未転記、利用条件不明を理由付きで保持。今回のS09/S10は原役割語が未転記で、正式受入を阻む不足。今回は取り直さず残した。
- 安定ID：今回のUUIDは研究namespaceから生成した仮IDで本番再利用しない。採用時に現行公開＋正式受入済み未公開の固定snapshotを再照合し、既存UUIDを再利用する。今回の旧KG照合は2026-10-26先行研究時点の観測で、現在値を主張しない。

## 承認・hashの境界
収集実行承認、意味語彙の採用、各Claimの正式受入、公開applyは別。新adapter／recipe／role定義／原資料を凍結し、review manifestとdecisionのUUID・本文hashを一致させる。資料追加やscope修正でhashが変われば新reviewにする。旧receipt・過去release・漫画v2承認を移植しない。validation-onlyの一時公開projectionは技術検証に限定し、hidden候補を撤回済みと偽装しない。

## 収集の優先順位と成功基準
件数ではなく、必要な両段が揃うかで次の対象を決める。今回の最小単位は「許されざる者のEastwood演技出演」と「ミリオンダラー・ベイビーのEastwood監督」の2つの独立Claim。片側だけの収集はこの問いを成立させない。Morgan Freemanの共演を追加するだけでは出演→監督の答えは増えない。

凍結baseと候補差分で、(1)新しい成立対象数、(2)人物・終点作品組、(3)独立Claim/Citationと保留数、(4)検索から証拠・Graph復元まで成功する代表経路、(5)ページ上限による部分取得を区別する。先行研究のBreadth/Depth/Discoverability/Evidence、連結成分・橋渡し評価は再利用し、単なるClaim追加や共通ORの増分で成功としない。

次の判断は、ACTINGの声・舞台等の境界、共同監督の扱い、作品単位null scopeの受入可否、原役割語不足を補う限定的な確認、最初の映画recipeの上限、共通gate改修に伴う漫画承認hashへの影響である。これらが決まるまで自動収集・正式受入・公開を接続しない。

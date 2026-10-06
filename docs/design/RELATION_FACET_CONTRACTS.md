# 三つの関係入口と条件解決の採用契約

更新日: 2026-10-06 / Phase 20 / runtime採用範囲

[Phase 19レビュー](EXPLORATION_CLASSIFICATION_RESOLUTION_REVIEW.md)の三つのrelation facetを、既存の条件編集へ接続する。[関係モデルの基本設計](RELATION_MODEL_PRINCIPLES.md)に従い、探索入口の分類と保存する命題・限定を分離する。Phase 19の研究台帳・prototypeは当時の検証材料として維持する。

## Catalogとresolver

| 安定ID | 日本語label | 解決先 |
| --- | --- | --- |
| relation.work-production | 作品制作への関与 | CONTRIBUTED_TO |
| relation.organization-involvement | 人物と組織の関わり | AFFILIATED_WITH |
| relation.event-participation | 特定開催回への参加 | PARTICIPATED_IN |

小さい対応表を`lib/client/relation-facets.ts`に置く。対応版は1。表示名・短い説明・編集方式の文言は`lib/i18n/relation-facets.ts`でlocale解決し、日本語・英語とlocale fallbackを持つ。翻訳・labelはIDや探索キーに含めない。全面多言語化・言語切替UIは今回追加しない。

選択IDはeditor内のdraftでのみ使用する。resolverは対応PredicateのOR集合を返し、既存normalizationにより順序・重複を除く。未知ID、未採用の`activity.academic`・`candidate.work`等は例外にし、黙って無視しない。facetは役割・立場・polarity・期間を設定しない。

Apply後は具体Predicate集合と既存の三精密条件が正本。APIへfacet IDや対応版を送らず、Neo4j・Claim・GraphState・snapshot・cursorへ追加保存しない。後日catalogが変わっても、受理済み探索や復帰は元の具体条件を使う。適用中の自然言語要約は完全一致する現在の入口がある場合だけ逆引きする。これは説明であり、条件の再解決ではない。

## 編集の三方式と空集合

一つの既存dialogで次を選ぶ。

- **すべての関係**: Predicate無制限。三精密条件は別途指定できる。
- **関係の種類から選ぶ**: 三入口から複数選択する。すべて選んでも三Predicateのみであり、アシスタント・影響は含まれない旨を表示する。
- **個別の関係を指定**: 既存五Predicateを自由に組み合わせる。ASSISTANT_OF / INFLUENCED_BYを含む条件をfacetへ丸めない。

`null`は無制限、`[]`は明示的に関係なし。個別五Predicate全部は従来どおり無制限へ正規化する。精密条件の全enum選択はnullに変換しない。限定なしClaimは個別enum選択に含めない。

editorを開く時は確定条件から方式を復元する。Predicate無制限は「すべて」、三入口で完全表現できる集合は「種類」、それ以外は「個別」。方式そのものは探索状態に保存しない。種類→個別は同じPredicateを保持する。無制限または表現できない個別条件から種類へ切り替える場合は選択なしから始め、画面に「関係を表示しない」のdraftを出す。個別欄に置換の説明を置き、近い種類へ自動移行しない。元の条件はCancelで維持できる。

種類方式の「この3種類をすべて選択」は三PredicateのORにする。個別方式の「すべて選択」はPredicate無制限に戻す。「すべての関係」のradioは方式によらずPredicate無制限へ戻す。「選択を解除」は現在の選択を空集合にする。方式変更・選択・追加条件の開閉だけで通信・Graph・選択・座標を変更しない。実効条件に差がある時だけApply可能とし、明示Apply時に既存探索世代を更新して同じ起点から再取得する。適用中と未適用の要約を分離する。

## 精密条件との合成

| 入口 | 追加条件例 | 実効条件 |
| --- | --- | --- |
| 作品制作への関与 | プロデュース | predicates=CONTRIBUTED_TO / contributionRoles=PRODUCING |
| 人物と組織の関わり | Visitor | predicates=AFFILIATED_WITH / organizationPositions=VISITOR |
| 特定開催回への参加 | 会議議長 | predicates=PARTICIPATED_IN / eventRoles=CHAIR |

追加条件は選択したPredicateに適用可能な既存sectionを表示する。初期は折り畳み、適用中の精密条件がある場合は開いて見える。型固有の値・原表記・scope・nullの意味は変更しない。

例えば無制限＋eventRoles=CHAIRは参加だけをCHAIRへ絞り、他Predicateは通す。参加入口＋CHAIRなら参加のみの中で絞る。複数入口にCHAIRを付けても組織や制作へ作用しない。適用先Predicateを除いた時は既存normalizationで不要な精密条件をnullにする。編集中の値は適用先を再選択すれば再利用でき、これは未適用draft内だけの動作。

## 取得・開閉・復帰

API契約・LIMIT前filter・condition key・cursor bindingは変更しない。直接Predicate指定と同じ具体条件なら同じ実効探索である。条件変更は旧要求を取消し、受理ページ・cursor・open意図を旧条件から引き継がない。

同じ条件での起点切替は具体四条件を保持し、「広く見る」は四条件をnullへ戻す。直前探索は具体条件・受理ページ・open意図・選択・座標・pan/zoomを従来どおり保存・復元する。close/reopenは受理範囲を復元する。条件外のrelated Claim詳細は比較対象として読めるが、Graphへ自動追加しない。

## 今回の非採用範囲と次の課題

activity facet「学術」、仕事関係、controlled tag、関係語のlexical検索は未実装。新taxonomy・Predicate・qualification・datasetは追加しない。Graph本体のlabel・肯否混在・Claim比較のpresentationは今回変更しない。

実ブラウザの観察・検証・次フェーズ判断は[Phase 20完了記録](../archive/phase-20-relation-facet/README.md)に残す。今後facet対応を変更する時も、過去の具体条件を黙って再解決しないことを維持する。

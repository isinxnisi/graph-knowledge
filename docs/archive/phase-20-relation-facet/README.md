# Phase 20：三relation facetの条件編集への接続

実施日: 2026-10-06 / 完了

## 採用範囲と変更

[現行契約](../../design/RELATION_FACET_CONTRACTS.md)の三つだけを採用した。Phase 19のIDをそのまま使用し、小さいcatalog版1、locale label／短い説明、純粋resolverをclient側に追加。対応先はCONTRIBUTED_TO／AFFILIATED_WITH／PARTICIPATED_IN。既存のPredicate・三typed限定・API・Cypher・GraphState・cursor・snapshot・DB・datasetを変更していない。

既存「見る関係を編集」内で「すべて」「関係の種類」「個別指定」を選ぶ。種類の三checkboxと、役割・立場の追加条件を別に表示する。完全一致しない個別条件は丸めず、要約も「個別指定」として残す。方式を切り替えただけでは取得しない。同じ具体条件ならApplyは無効。変更したdraftは明示Applyで確定し、Cancelで捨てる。

追加条件を開くとdialogが長くなったため、適用／キャンセルを下部に保つsticky footerを追加した。適用先のない個別条件では追加条件の空見出しを表示しない。新しい文言は安定キーとlocaleを分け、日本語・英語を用意した。画面全体の言語切替は追加していない。

## 具体条件の例

| 操作 | 実効条件 | 観察したGraph |
| --- | --- | --- |
| demo 青葉ハル：制作＋組織 | predicates=AFFILIATED_WITH,CONTRIBUTED_TO | Entity 3 / Claim 2 |
| 漫画v2 長崎尚志：制作＋プロデュース | predicates=CONTRIBUTED_TO / contributionRoles=PRODUCING | Entity 2 / Claim 1 |
| science v2 ハイゼンベルク：組織＋Visitor | predicates=AFFILIATED_WITH / organizationPositions=VISITOR | Entity 2 / Claim 1 |
| Event 特定開催回：参加＋会議議長 | predicates=PARTICIPATED_IN / eventRoles=CHAIR | Entity 2 / Claim 1 |

Apply前には上記条件をAPIへ送らず、元のGraphと確定要約を維持する。取得URLにはfacet IDを含めない。「この3種類をすべて選択」と無制限のradioを分けた。3種類全部は三PredicateのORにとどまり、全五Predicate／nullにはならない。無選択は明示空集合。無制限＋CHAIRだけなら他Predicateを通し、参加入口＋CHAIRなら参加の中だけを辿る。

## ブラウザ確認と観察

- demo：制作＋組織はORで2 Claimを取得。三入口に含まれないアシスタント・影響の個別指定、肯否混在・出典比較・条件付きページング・旧応答破棄・開閉・条件保持の起点切替と復帰は全31経路で維持できた。
- 漫画v2：制作入口とプロデュースの二段階が同じeditor内で読み取れる。Graphを閉じて再開し、「広く見る」後に具体条件・座標・pan/zoom・選択を復帰できた。既存の実Role詳細／刊行物scope／条件外Claimも維持。
- science v2：Visitorだけを絞ることと広い組織関与の違いを、適用中の「人物と組織の関わり（Visitor）」で確認できる。Associate professorとの期間別比較、条件外の広いClaim、ページングと旧応答破棄は既存テストで確認。読みやすさのため最終footer付きeditorも再確認した。
- Event：特定開催回への参加と会議議長を別の条件として選べる。広い参加＋CHAIR限定を表示Relationで束ねても、詳細では独立Claimとして戻れる。三用途条件の作用先、休止した子孫の復元、起点切替・復帰も回帰なし。
- 最終の「この3種類をすべて選択」の調整後にも4環境のfacet経路を各1件再実行して成功した。新しい4つのfacet経路で、編集・Cancelはneighbors通信0回、Applyは1回、close/reopenは追加通信なし、広く見るは1回、直前復帰は追加通信なしを検証する。復帰は具体条件と座標・pan/zoom・選択の一致まで確認する。

スクリーンショットは実表示を確認して保存した。

| dataset | 条件editor | 適用Graph |
| --- | --- | --- |
| demo | [制作＋組織のdraft](demo-editor.png) | [OR条件のGraph](demo-applied.png) |
| 漫画v2 | [制作＋プロデュース](pilot-urasawa-v2-editor.png) | [適用Graph](pilot-urasawa-v2-applied.png) |
| science v2 | [組織＋Visitor](pilot-science-v2-editor.png) | [適用Graph](pilot-science-v2-applied.png) |
| Event | [特定開催回参加＋会議議長](pilot-event-v1-editor.png) | [適用Graph](pilot-event-v1-applied.png) |

過去のarchive画像へ書いていた既存テストの出力先はtest-resultsへ変更し、今回の回帰で上書きされた過去画像は元へ戻した。

## 検証

| 検証 | 結果 |
| --- | --- |
| vocabulary / qualification check | 0 error。既存の同一端点Predicate比較に関するwarning 1件は継続 |
| unit / component | 219 passed / 10 files（新規14件） |
| demo seed / API integration | 23 passed / 2 files（新規1件） |
| 漫画v2実DB integration | 1 passed |
| science v2実DB integration | 1 passed |
| Event受入済み実DB integration | 1 passed。人工実DBのケースは`-t`で対象外 |
| demo Playwright | 31 passed（全四環境で50経路） |
| 漫画v2 Playwright | 9 passed |
| science v2 Playwright | 5 passed |
| Event Playwright | 5 passed |
| typecheck / lint / build | 成功 |
| fixture validation | demo schema v1 / Entity12・Claim15・Source5・Citation15、成功 |
| 凍結入力・研究台帳・過去archive | HEAD 94de3c2の165ファイルとbyte一致 |

resolverは三対応、複数OR・順序・重複、未知／未採用IDの拒否、null／空集合／三種類全部、個別条件の完全一致、三精密条件の作用先とlocale境界を検証した。componentではCancel、適用前draft、同じ条件の方式変更、精密条件との合成を確認。新API integrationは直接Predicate指定と同じ応答・ページングになり、違う条件の旧cursorと未知facet queryが400になることを実DBで確認した。

### 実行コマンドと環境

Node24を`PATH=/tmp/graph-knowledge-node/bin:$PATH`で使用。Chromiumの共有ライブラリは既存の`LD_LIBRARY_PATH=/tmp/noir-browser-tools/libs/usr/lib/x86_64-linux-gnu`を使用した。

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run fixture:validate
API_TEST_BASE_URL=http://127.0.0.1:3210 npm run test:integration
npm run pilot:v2:integration
npm run science:v2:integration
npm run event:integration -- -t 受入済みEvent
GRAPH_TEST_REUSE=1 npm run test:e2e
GRAPH_TEST_REUSE=1 npm run pilot:v2:e2e
GRAPH_TEST_REUSE=1 npm run science:v2:e2e
GRAPH_TEST_REUSE=1 npm run event:e2e
GRAPH_TEST_REUSE=1 npm run test:e2e -- tests/e2e/facets.spec.ts
GRAPH_TEST_REUSE=1 npm run pilot:v2:e2e -- --grep Phase20
GRAPH_TEST_REUSE=1 npm run science:v2:e2e -- --grep Phase20
GRAPH_TEST_REUSE=1 npm run event:e2e -- --grep Phase20
```

既存サーバーには古いbuild／clientが残っていたため、現行codeで起動し直した。demo最終確認はproduction buildの3210、漫画v2は3212、科学v2は3214、Eventは3215。devとbuildを同じdistで同時実行した際のTurbopack更新エラーを避け、demoはbuild後にproductionを起動して検証した。

初回はNeo4j起動・高負荷時の5秒query timeoutで503が発生した。healthcheckのcypher-shellは実測約20秒で、既存10秒の待ち時間も超えた。**製品のquery timeout・composeは変更していない。** demo統合検証時だけ`/tmp/graph-knowledge-phase20-health.yaml`でhealthcheck timeout60s／interval15sを指定し、`COMPOSE_FILE=compose.yaml:/tmp/graph-knowledge-phase20-health.yaml`を付けて起動・統合テストを実行した。同じ既存Cypherの読み取りによる準備も実施した。終了時はこの待機設定のDBがhealthyな状態で稼働している。通常のcompose upでは元の待機設定へ戻る。最終結果はDB停止・復旧を含む全23件が成功。最後の4環境同時確認でも漫画v2の初期取得待ちが15秒を超えたため、単独で再実行して成功を確認した。製品やテストのtimeoutを緩めて通した結果ではない。初回の環境失敗を成功件数に含めない。

## 今回残した課題と次フェーズ判断

条件editorは種類と精密条件の組合せを明示できた。一方、どの入口が現在datasetに登録されているかはcatalogだけでは分からない。今回はavailability集計やおすすめを追加しない。長い説明・複数の精密条件ではeditor内のスクロールが必要だが、適用／取消は見失わない。

Graph本体の「関わりがあった」は、限定なし／Visitor／Professorの違いを詳細ほど表現しない。Role・立場をGraphの概要へ出しても、同じ束に広いClaimも含むことは線だけでは分かりにくい。demoの「異説あり」についても、肯否と限定・期間の違いを自動的に真偽対立へ変換しない、Phase 16の原則とのpresentation整合が残る。今回これらのlabel・比較処理は変更していない。

**次の1フェーズは、Graphの表示Relationの短い概要とClaim詳細を揃え、肯否混在を中立的に表現する小さいpresentation改善を推奨する。** 今ある資料・人工回帰ケースで観察でき、知識モデルを増やす必要がない。activity facet「学術」の保存・取得方式、lexical検索、tag、preset、汎用taxonomyは引き続き研究／未実装とする。

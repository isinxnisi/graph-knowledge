# Phase 17：Entity概要の関係・方向優先

2026-10-06。**完了**。[採用契約](../../design/ENTITY_OVERVIEW_PRESENTATION.md)。意味モデルはPhase 16のまま、概要のpresentationを改善した。

## 問題と採用構造

以前は関係名の直下に肯定／否定件数が並び、NBIの「肯定6件」、Solvay開催回の「肯定3件」が、関係や人数の説明より先に見えた。Roleがある制作概要だけ別の折り畳みがあり、組織立場／Event立場は概要で分からなかった。demoでは五つの視点別項目と統計説明が縦に伸びていた。

小さい方向付き一覧を採用。種類を見出し、kindと中心端点を矢印で示し、内向き／外向きを分ける。INFLUENCED_BYの逆視点は「影響を与えた」と自然に読み、下の矢印では保存上の「人物→影響を受けた→この人物」を説明する。逆Claimは生成しない。矢印は命題の方向で、因果や同時性を認定しない。

件数・限定別内訳・件数の意味・domain注意書きは各項目の閉じたdetailsへ移した。指定値は別domainの語彙を二種類まで補助表示し、残りも内訳へ残す。nullを共通Roleにせず、全役割の肯定とも扱わない。混在は「肯定・否定の主張あり」、否定のみは文言／説明／破線。真偽の自動判定・順位付けはない。

概要は現在Graphとは独立した集計のまま。閉じるだけの「Graphに戻って関係を選ぶ」を足し、既存の広く見る／同条件切替はその下へ置いた。内部だけスクロールし、見出しと操作を残す。全画面レイアウト、Graph style・layout、クリック、選択、開閉、条件、cursor、復帰処理は変更していない。

## 最小API変更とファイル

既存overview応答にorganizationPositions／eventRolesの固定配列を追加。条件外・未取得の立場も専用集計から正しく返すための変更で、contributionRolesと同じ固定型方式。その他のAPI・Claim schema・Neo4jモデル・seed・fixture・凍結datasetは不変。DISTINCT Claim集計でCitation／SourceへJOINしない。未知enum・誤適用値は500、非適用配列は空。

- components/EntityOverview.tsx・Explorer.module.css：一覧、統計の折り畳み、戻る導線、内部スクロール。
- lib/client/overview-presentation.ts：視点別関係名・方向・domain別限定の短い表示。API値を保存命題へ変換しない。
- lib/i18n/entity-overview.ts：新しい文言のlocale境界。domainの語彙辞書は不変。
- lib/domain/api.ts・lib/server/queries.ts・graph.ts：二つの固定内訳のschema・集計・検証。
- tests/overview.test.tsx、既存integration／Playwright：統計の閉状態、向き、肯否、限定、既存探索への影響を検証。
- PROJECT_CONTEXT／ARCHITECTURE／docs入口／root README／現役レビュー：現行仕様への参照と完了状態。

## 実画面での比較

1440×1000のChromiumで実際のdatasetを表示し、スクリーンショットを確認。小さい画面1160×650、既存light／dark-blue／dark-brownでも概要を確認する。利用者調査の結果ではなく、実データを通した実装者の画面観察。

| 対象 | 初期表示で読めるもの | 内訳へ移したものと注意 |
| --- | --- | --- |
| demo・青葉ハル | 組織／アシスタント／制作／影響の種類、影響の両視点、肯否混在 | アシスタント2肯定／1否定等。demo制作はRole限定なし。要求に合わせてRoleを創作せず、実Roleは漫画pilotで確認 |
| 漫画v2・長崎尚志 | 作品へ伸びる制作関係、プロデュース・脚本・ほか1種類の記録 | 6 Claim＝広い3＋限定3。ストーリー共同制作やpublication scopeは内訳／既存詳細へ。作品や担当期間の総数ではない |
| science v2・NBI | 人物から組織へ、関係者、Associate professor／Visitorの記録 | 6 Claim＝広い4＋限定2、接続人物は4。教員／訪問者を6人と誤読させる数字は初期表示しない |
| Event・第5回Solvay | 人物から開催回へ、参加者、会議議長の記録 | 3 Claim＝Lorentz広い＋CHAIR／Dirac広い、接続人物2・Graph線2。開催期間から全日程参加を推論しない |
| Event・ディラック | 組織への関与とEventへの参加の二種類 | 複数domainでも別predicateの一覧で扱う。制作Roleを持っているように見せない |

Source確認は概要へ一覧を足さず、Graph／テキスト隣接一覧から既存Claimカードへ降りる。広い＋限定を個別に確認し、Président／原語・locator・Source URL・Claim期間不明へ戻れる。概要が現在条件外の情報も示すこと、広く見る／同条件切替／直前復帰、座標・pan/zoom・開閉意図が維持されることも確認する。

### 画面記録

- demo：[以前](demo-before.png)／[改善後](demo-after.png)
- 漫画v2：[改善後](manga-after.png)
- science v2：[以前](science-before.png)／[改善後](science-after.png)
- Event：[以前](event-before.png)／[改善後](event-after.png)／[内訳を開いた状態](event-statistics.png)
- 複数domainの人物：[ディラック](dirac-overview.png)
- 小さい画面：[1160×650](demo-compact.png)
- テーマ：[dark-blue](demo-dark-blue.png)／[dark-brown](demo-dark-brown.png)

## 検証結果

作業環境はNode24.21.0。PATH=/tmp/graph-knowledge-node/bin:$PATH、PlaywrightではLD_LIBRARY_PATH=/tmp/noir-browser-tools/libs/usr/lib/x86_64-linux-gnuを使用。製品に作業用PATH／ライブラリpathを固定しない。

| コマンド／確認 | 結果 |
| --- | --- |
| npm test | 205件成功（10ファイル）。追加の6件は方向・三domain限定・否定のみ／混在・統計の折り畳み・0件／失敗／再試行 |
| npm run lint | 成功。既存の同一端点predicate比較warning 1件、語彙／Role／限定checkはerror 0 |
| npm run typecheck | 成功 |
| npm run build / npm run event:build | 成功。最終のアクセシブルな方向図にも型／lint／buildを確認 |
| API_TEST_BASE_URL=http://127.0.0.1:3210 npm run test:integration | demo 22件成功。専用集計、全視点、条件外／未取得、複数Citation、公開範囲、空、400／404／405／500／実DB停止503 |
| npm run pilot:v2:integration | 1件成功。Role内訳、未指定、人工肯否対照、Source、snapshot不変 |
| npm run science:integration | 科学v1の回帰1件成功。広いClaimだけのnull内訳、旧入力／Source／期間、不変snapshot |
| npm run science:v2:integration | 1件成功。NBIのnull4／Visitor1／Associate professor1、誤保存enumのoverview500と復旧 |
| npm run event:integration | 2件成功（人工／実資料）。実開催回null2／CHAIR1、人工CHAIR肯否別、Citation数で水増ししない集計、未知INVITEDのoverview500と復旧 |
| GRAPH_TEST_REUSE=1 npm run test:e2e | demo 30件成功。追加2件は種類／方向／初期折り畳み、Graph不変、フォーカス復帰、650px高、人工否定のみ |
| GRAPH_TEST_REUSE=1 npm run pilot:v2:e2e | 8件成功 |
| GRAPH_TEST_REUSE=1 npm run science:v2:e2e | 4件成功 |
| GRAPH_TEST_REUSE=1 npm run event:e2e | 4件成功 |
| GRAPH_TEST_REUSE=1 npx playwright test --config=playwright.event-contract.config.ts | 人工3件成功。三限定条件・肯否・詳細・条件外・snapshot／復帰・通信世代 |
| git diff --check | 成功 |
| 凍結dataset／fixture／意味辞書 | Git差分なし。unitの台帳／生成物／manifest検証と、各integrationの再seed0／0・前後snapshotも確認 |

最終検証はdataset別に行い、DB停止テストはdemoで実施した。API統合は既存Webを指定し、Next devの同じdistDirへの二重起動を避けた。初回にはその起動競合、複数DBのhealth check負荷による503／seed timeout、人工DB起動前の接続失敗が発生した。対象外の検証DBを一時休止し、滞留したhealth check子プロセスを整理して再実行。製品のtimeout・データ契約は変えず、上表の最終結果を確認した。科学v1の起動は専用.env.science指定で修正し、既存volumeを保持する。各検証DBの休止を解除し、科学v1も健康確認済み。休止解除後もEvent／人工Event／科学v2のCLI health checkが10秒制限でtimeoutしたため、専用volumeを保持して順次再起動し、検証環境だけ一時override（interval／timeout各30秒）を適用し、6検証DBすべてhealthyを確認した。repoのcompose・アプリ読取timeout・DB意味モデルは変更しない。demo／Event Webは更新したproduction build、漫画v2／科学v1・v2は既存devで再確認する。人工検証用に起動したWeb3216は検証後に停止する。

実資料のClaim／Citation／Source詳細、条件取消／明示適用、ページング、広く見る／同条件、直前復帰、休止復元、座標／pan/zoomも各datasetの既存経路で回帰確認。画像確認は利用者調査ではなく実装者による表示観察。稼働環境復旧後に4 Webで開始例→概要→閉じるを再実行し、アクセシブルな方向図・初期折り畳み・Graph件数維持・page error 0を確認した。

合計unit 205件、integration 27件、Playwright 49件が成功。

概要APIの実応答例：[demo](demo-overview.json)／[science v2](science-overview.json)／[Event](event-overview.json)。再起動後のscience v2／Event応答も、内訳の順序を除き同じ内容であることを確認した。他の読み取りAPI例は既存docs/API_RESPONSE_EXAMPLES.jsonのまま。

## 画面の確認方法

起動方法はroot READMEの各datasetの手順を使用する。今回の検証後はdemo http://127.0.0.1:3210 、漫画v2 http://127.0.0.1:3212 、science v2 http://127.0.0.1:3214 、Event http://127.0.0.1:3215 を利用する。固定開始例から対象を選び、Entity詳細の「関係概要を見る」を押す。方向／種類を読み、必要なら「主張・限定の内訳」を開く。「Graphに戻って関係を選ぶ」で既存詳細へ戻る。

## 残る不足と次のGraph課題

presentationで解消したのは、統計優先、関係方向の弱さ、二domainの限定の見えなさ、読取中に閉じる／起点変更操作が画面外へ出る点。件数を接続数へすり替えず改善できた。

意味モデル側では未構造化の職位・scope、歴史的名称、期間不明は残る。NBIの旧称や同時在籍の判断は一覧表示から補完できない。詳細を見れば原資料の具体性があるケースと、型として取得／比較できないケースを引き続き分ける。

Graph本体は一部predicateの旧「異説あり」、広い＋限定の束で何が記録されているかの説明、長い名称・ラベルと詳細への対応を改善候補とする。概要から特定種類で見る、相手へ直接進む等は今回追加しない。保存・新語彙・taxonomyの先行実装は不要。


### この環境のhealth check補足

一時overrideは/tmp/graph-knowledge-phase17-health.yaml（repo外）に以下を置き、該当三環境だけ元のcomposeへ重ねる。Sourceやdataset設定の変更ではない。通常のsource composeで再起動すれば既存のチェック設定へ戻る。

```yaml
services:
  neo4j:
    healthcheck:
      interval: 30s
      timeout: 30s
```

```sh
docker compose --env-file .env.event -f compose.event.yaml -f /tmp/graph-knowledge-phase17-health.yaml up -d --wait --wait-timeout 180
docker compose -f compose.event-test.yaml -f /tmp/graph-knowledge-phase17-health.yaml up -d --wait --wait-timeout 180
docker compose --env-file .env.science-v2 -f compose.science-v2.yaml -f /tmp/graph-knowledge-phase17-health.yaml up -d --wait --wait-timeout 180
```

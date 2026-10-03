# Step 5：既存Vertical Sliceの探索UI調整

実施日：2026-10-03。Step 4の探索機能を維持し、表示・配置・選択フィードバック・詳細の読みやすさを調整した。

## 添付画面から判断した問題

受け取った展開済み画面は11 Entity / 15 Claim。中心と隣接Nodeの間へ並行・双方向Edgeのラベルが集中している。同名の佐藤アキ2人は名称だけでは区別できない。Graphと一覧を含む画面全体が縦に伸び、選択や詳細の位置関係を追いづらい。Claimを選ぶと既存の隣接一覧が消え、Graph以外から選択状態を確認しにくい。

## 実際の変更

- Graphの初期配置を中心固定の放射状presetに変更。追加Nodeだけを配置し、既存Nodeの座標とpan/zoomは維持する。
- 並行・双方向のClaimを端点の組で分類し、各Claimに別々のunbundled-bezier曲線を割り当てる。分類は表示用だけで、Claimの統合はしない。
- 現在は3本以上をID順に320刻み・重み0.5で分散し、2本は260刻み・重み0.3/0.7にする（後述の回帰修正で更新）。同一関係の複数Claimは肯否・期間をラベルに付ける。ラベルは13px、最大幅145px、否定は独立した行で表示。矢印と破線は維持する。
- Nodeを116×64、文字を14pxにする。Graph内に同名が複数ある場合だけdescriptionの先頭句を補助表示する。「佐藤アキ / 漫画家」「佐藤アキ / 編集者」を区別し、通常の人物は名称だけ。説明も一致する場合はID先頭8桁を添える。
- 展開済みは二重枠、直近に表示されたNodeは淡い外枠のみ、選択Node/Edgeは強い枠・太線。Graph上部に選択対象と取得状態を文字表示する。
- 三列を190px / 可変 / 300pxへ変更。1440×1000ではCanvasを約540px高に確保する。画面高に合わせて配分し、詳細と隣接一覧を個別スクロールにする。短い画面では一覧の配分を減らす。
- Claim選択中も、その主体の隣接一覧を維持する。該当行・ボタンのaria-pressedを選択と同期し、Graphからも一覧からも同じ選択処理を使う。
- 詳細カードの主張・肯否・期間・出典を区切り、各CitationのSourceと参照箇所をまとまりとして表示する。関連主張は同じ形式で縦に比較し、表示順が正しさや信頼度を表さないと明記する。

CytoscapeのEdge styleの対応範囲は[公式ドキュメント](https://js.cytoscape.org/#style/edge-line)を確認した。外部レイアウトやUIライブラリは追加していない。

## 作成・変更ファイル

- components/GraphCanvas.tsx、Explorer.tsx、RelationsList.tsx、ClaimDetails.tsx、Explorer.module.css
- lib/client/graph-presentation.ts：表示補助と曲線割り当て
- app/layout.tsx、app/layout.module.css：body余白を除去
- tests/ui-state.test.tsx：同名補助・説明一致・曲線割り当てを追加
- tests/e2e/explorer.spec.ts：展開後のGraph・同名・選択同期・短い画面を追加
- playwright.config.ts：GRAPH_TEST_PORT、GRAPH_TEST_REUSEを任意指定できるようにした
- README.md、PROJECT_CONTEXT.md、ARCHITECTURE.md、本記録、docs/screenshots/step5-*.png

## 変更しなかった点と理由

Neo4jモデル、Claim/Citation/Source構造、fixture、API契約、探索の一段階制限とページング、100 Entity / 200 Claimの上限は変更していない。問題は表示の密集と操作フィードバックであり、データの意味を変える必要がないため。各Claimは独立したEdgeのままで、関係の省略・統合・信頼度評価・矛盾判定はしない。

検索・詳細・Graphのデータ取得は既存APIを利用し、ブラウザからNeo4jに接続しない。認証、投稿、編集、PostgreSQL、Wikidata、AI、自動多段探索は追加していない。React stateの探索・通信管理もStep 4のまま。

## 実ブラウザで確認した内容

既存のseed済みNeo4jを利用し、Chromiumで確認した。

1. 青葉ハルの初期Graph：5 Entity / 7 Claim。
2. 星の航路、橘ソラ、黒川レン、白石ミオ、水野ナツ、月の工房、青空出版、月刊コミック灯を順番に選択。添付と同程度の11 Entity / 15 Claimへ展開。
3. 各展開前後で既存全Nodeのモデル座標が一致することを検証。
4. 佐藤アキ2人のラベルに漫画家／編集者が入り、通常の青葉ハルには説明が入らないことを確認。
5. ASSISTANT_OFの3 Claimを独立した曲線で表示し、中点距離が30以上であることを検証。実画像でラベルと否定の行を確認。
6. Nodeをクリックし、選択文字表示とEntity詳細を確認。Edgeを実クリックし、C01の2出典とrelated Claimの期間・否定を確認。
7. Claim選択時の一覧ボタンaria-pressed=true、一致する行の枠表示を確認。一覧から黒川レンを選び、Graphのchosen要素が同じEntity IDになることを確認。
8. 1440×1000と1160×650で、画面全体が縦にスクロールせず、後者でもCanvas高が260pxを超えることを確認。
9. 既存の同名検索・孤立Entity・出典未確認・ページング・上限・APIエラー・再試行を回帰確認。

ブラウザテストは6件の既存テスト＋1件の追加テスト。画像はPlaywrightの実スクリーンショットを確認した。手動で全経路を別途クリックしたという意味ではない。上限・HTTPエラーは従来どおりテスト応答で制御し、DBを変更・停止していない。

## 確認画像

- [青葉ハルの初期Graph](screenshots/step5-initial.png)
- [11 Entity / 15 Claimまで展開](screenshots/step5-expanded.png)
- [Claim選択・詳細・隣接一覧](screenshots/step5-detail.png)
- [1160×650の表示](screenshots/step5-compact.png)

## 検証コマンド

```bash
GRAPH_TEST_REUSE=1 npm run test:e2e
npm run typecheck
npm run lint
npm test
npm run build
```

この環境ではNode 24.21.0にPATHを設定し、Step 4と同じChromium用共有ライブラリのLD_LIBRARY_PATHを指定した。3210番のNext.js開発サーバーがユーザーの画面確認用に起動済みだったため、明示的なreuseオプションで利用し、停止していない。別ポートでも同じディレクトリに二つのdevサーバーは起動できない。

## Step 5後にも残るUX上の課題

- 短い画面で11 Entity全体を収めるとラベルは小さくなる。全体表示と個別拡大・パン、テキスト一覧の併用が必要。全体表示だけで常に読めるという保証はない。
- 大量の並行Claim、長い関係名、任意の追加展開順ではEdgeの交差・ラベルの重なりが残り得る。今回の方式は局所的な分散であり、重なりを全域で最適化するものではない。
- 同名の補助表示は表示中Graphの同名を検出してから付く。未取得の同名まで検出しない。descriptionの短い先頭句は完全なプロフィールではなく、詳細で全文を確認する。
- 初回の多い近傍数では放射状配置が広くなり、追加Nodeが画面外に出る場合もある。既存位置維持を優先し、自動fitは追加時に行わない。
- Graphのキーボード操作・読み上げはテキスト一覧を代替経路として維持するが、包括的なアクセシビリティ監査、モバイル、性能計測は別途必要。今回のテスト件数は性能保証を意味しない。

## Step 5初回調整時の検証結果

- Playwright：7件成功（既存6件＋追加1件）、約1.2分。
- typecheck：成功。
- lint：成功。
- test：50件成功（Step 4までの47件＋表示補助の3件）。
- build：成功。ルートページと既存4 APIの構成を維持。
- git diff --check：成功。

UI調整とその検証をStep 5の今回の完了範囲とし、上記の残るUX課題を将来の改善対象として記録する。

## 軽微な表示修正

「＋追加」は追加操作に見えるためNodeの文字ラベルから削除した。既存の淡い外枠による強調を維持し、凡例を「淡い外枠：新しく表示されたNode」に変更。同名補助、Node選択、展開済み二重枠、Claim表示、API・DB・fixtureは変更していない。既存ブラウザテストの同名ラベル検査を完全一致にし、新たに表示されたNodeにも補助情報以外の文字が付かないことを確認する。

修正後の既存Playwrightテストは7件すべて成功（約1.3分）。同名表示・選択同期・既存位置保持・Claim詳細・ページング・上限・エラー復旧への影響なし。確認画像も更新した。

## ASSISTANT_OF 3本の分離を改善

添付例のC01/C02/C03を回帰対象とした。旧テストの中点距離はGraph座標で30以上を確認していたが、1160×650の11 Entity / 15 Claimの全体表示では画面上の間隔が約22.34pxになっていた。新しい画面座標の回帰テストが旧実装で失敗することを先に確認した。

3本以上の端点ペアは曲線制御点の間隔を130から320へ広げ、重み0.5で対称に分けた。2本は間隔260・重み0.3/0.7を維持する。同一subject/predicate/objectについて複数Claimがある場合だけ、関係名に肯否・期間を付ける。C01は肯定2001〜2003、C02は肯定2002〜2004、C03は否定2001〜2003として表示され、同じラベルの重複に見える状態を避ける。期間は既存APIの部分日付をそのまま使い、推定や評価をしない。

矢印はtarget側のtriangle、source側はnoneを明示して1.2倍にした。否定の破線を維持する。ラベル背景を不透明にして文字の上を線が通らないようにし、ラベルのクリックもそのEdgeへ渡す。GraphのNode配置・ID、API・fixture・Claim構造は変更していない。

新しい実ブラウザ回帰では、全体表示からzoom/panを変えずに3本を確認する。画面中点間隔30px超、ラベル境界間隔4px超、肯定2本・否定1本、subject/target IDと矢印を検査する。各線の中点を実クリックし、選択Edge IDと「選択した主張」のカードIDがC01/C02/C03にそれぞれ一致することを確認する。表示補助のテストも実fixtureで3つの経路と異なる期間・肯否ラベルを確認する。

[全体表示の確認画像](screenshots/assistant-parallel-overview.png)と[同じGraphの3本を拡大した画像](screenshots/assistant-parallel-focus.png)を記録する。拡大画像は読取り用の記録であり、回帰テストの間隔・クリックの検証時には拡大していない。縮小した全体表示で文字自体が小さくなる制約は引き続き残る。

今回の最終結果：Playwright 8件成功（既存7件＋専用回帰1件）、通常テスト51件成功（表示補助の専用回帰1件を追加）。typecheck・lint・build・git diff --checkも成功。Node配置やAPI・DB・fixtureへの変更はない。

## 追加調整: 表示Relationへの集約（2026-10-03）

ユーザーの最新指定により、以前の「各Claimを別Edge・期間付きラベルで表示する」方針を更新した。過去の並行Claim検証は当時の記録で、現在の仕様はARCHITECTURE.mdの「表示Relationと独立Claim」に従う。

- `lib/client/graph-presentation.ts`で取得済みClaimをsubjectId/predicate/objectIdで集約。API・DB・fixtureは変更しない。
- 表示Edgeは `{id, source, target, claimIds, polarity, label, distance, weight, labelOffset}`。idは表示専用の安定キー、source/targetは元の主体/対象。Claim IDと混同しない。
- 「異説あり」は取得済みClaimにaffirmedとdeniedが両方ある場合だけ。期間差や出典数では判定せず、真偽や信頼度の評価を行わない。肯定のみは関係名だけ、否定のみは否定の文字と破線、混在は異説の文字と点線。
- Edge選択では既存Claim APIとrelatedClaimIdsで全公開Claimを取得し、ID順で同格のカードとして縦並びする。期間・肯否・Citation・Source・出典未確認を各カードで確認可能。取得失敗では再試行を案内する。
- Graphは取得済みページだけから集約する。未取得ページがある場合は範囲を明示し、詳細で取得した関連ClaimをGraphへ自動追加しない。Claim上限200とページの拒否・cursor維持は従来通り。
- unbundled-bezierの単独Relationはdistance=0、同じ端点組の別Relationは48刻み（2本±24）、weight=0.5。曲線を大きくする代わりにラベルの縦位置を32刻み（2本±16px）で分ける。Node配置は変更しない。
- 初期7 Edge→5 Relation、全展開15 Edge→13 Relation。青葉ハル→黒川レンのASSISTANT_OFは3 Edge→1 Relation。独立Claim数は7 / 15のまま。
- 選択にはRelation種別を追加。一覧は個別Claimの操作を維持し、選択Claimに対応するGraph Relationを強調する。Relation選択では所属する一覧行を強調する。

検証: unit 53件、Playwright 10件。実DBで検索、初期Graph、Work・循環・全展開、同名、3 Claim詳細、複数出典、一覧、ページング、上限、API失敗を確認。追加のブラウザ通信スタブで肯定のみの集約、同じ端点の別predicate、単一否定・出典未確認を確認。最終的にtypecheck / lint / test / Playwright / buildはすべて成功。初回のPlaywrightでは凡例の増加で短い画面のGraph高が低下し、凡例を簡潔にして回帰を解消した。

現在の記録画像: [初期Graph](screenshots/relation-initial.png)、[全展開Graph](screenshots/relation-expanded.png)、[Relation詳細](screenshots/relation-detail.png)。

残る制約: 任意の大規模Graphでラベル重なりを完全に防ぐ配置最適化は行っていない。多くの関連Claimの詳細取得・ページングは将来のデータ拡大時に検討する。Graphの「異説あり」は取得済みClaimの範囲であり、未取得ページまでないことを保証する表示ではない。

## 追加調整: Node配置・曲率・ラベルのバランス

Relation集約後の曲率が弱すぎることと、Node配置・余白の偏りを再調整した。最新の数値・判断理由・画像は [IMPLEMENTATION_GRAPH_BALANCE.md](IMPLEMENTATION_GRAPH_BALANCE.md) を参照。前節の48刻み曲率や32刻みラベルオフセットは当時の記録で、現在は端点間の距離に応じた曲率を採用する。

## 最終調整: テーマと初期Vertical Sliceの完了

共通テーマを画面・Graphへ適用し、初期ローカルデモを完了として区切った。配色、意味表現の維持、コントラスト確認と画像は [IMPLEMENTATION_THEME.md](IMPLEMENTATION_THEME.md) を参照。将来機能と本番公開準備は未着手。

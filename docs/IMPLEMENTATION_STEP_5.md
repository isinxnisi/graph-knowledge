# Step 5：既存Vertical Sliceの探索UI調整

実施日：2026-10-03。Step 4の探索機能を維持し、表示・配置・選択フィードバック・詳細の読みやすさを調整した。

## 添付画面から判断した問題

受け取った展開済み画面は11 Entity / 15 Claim。中心と隣接Nodeの間へ並行・双方向Edgeのラベルが集中している。同名の佐藤アキ2人は名称だけでは区別できない。Graphと一覧を含む画面全体が縦に伸び、選択や詳細の位置関係を追いづらい。Claimを選ぶと既存の隣接一覧が消え、Graph以外から選択状態を確認しにくい。

## 実際の変更

- Graphの初期配置を中心固定の放射状presetに変更。追加Nodeだけを配置し、既存Nodeの座標とpan/zoomは維持する。
- 並行・双方向のClaimを端点の組で分類し、各Claimに別々のunbundled-bezier曲線を割り当てる。分類は表示用だけで、Claimの統合はしない。
- 曲線の制御点距離はID順に130刻みで分散し、2本の場合は間隔を倍にする。制御点の重みは0.3〜0.7。ラベルは13px、最大幅145px、否定は独立した行で表示。矢印と破線は維持する。
- Nodeを116×64、文字を14pxにする。Graph内に同名が複数ある場合だけdescriptionの先頭句を補助表示する。「佐藤アキ / 漫画家」「佐藤アキ / 編集者」を区別し、通常の人物は名称だけ。説明も一致する場合はID先頭8桁を添える。
- 展開済みは二重枠、直近に追加したNodeは「＋追加」と淡い外枠、選択Node/Edgeは強い枠・太線。Graph上部に選択対象と取得状態を文字表示する。
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

## 最終検証結果

- Playwright：7件成功（既存6件＋追加1件）、約1.2分。
- typecheck：成功。
- lint：成功。
- test：50件成功（Step 4までの47件＋表示補助の3件）。
- build：成功。ルートページと既存4 APIの構成を維持。
- git diff --check：成功。

UI調整とその検証をStep 5の今回の完了範囲とし、上記の残るUX課題を将来の改善対象として記録する。

# Phase 11：モデル検証サンプル構成・開始例の実装

2026-10-05。DB・API・predicate／Role契約・fixture・凍結datasetは変更せず、[検証構成案](../../design/RELATION_MODEL_VALIDATION_SAMPLES.md)と固定開始例UIを追加。

## データ設計の成果

漫画v2の14 Claimと科学8 Claimを既存22件として利用（漫画v1を重複計上しない）。新規14–20件、合計36–42件を上限目安にする。まずハイゼンベルクとNBIの時期別立場、キュリー家の親子／配偶者、映画作品同士の派生の約7候補を収集し、約29件分で第1回レビュー。その後態度・組織間・特定回参加を追加。資料未確認／403・同一性未確定・人間未受入は保留。科学C09もpendingを維持する。

候補ごとに広いpredicate、細分predicate、typed限定／Role、domain固有限定、共通typed機構の利点・損失・過剰推論・肯否・比較・条件取得を比較する。新語彙・eventや汎用限定schemaを今回採用した扱いにしない。現行predicateに入らない候補は台帳へ留め、意味契約レビュー→必要な最小実装→新dataset投入→同じUIで観察する。

## 固定開始例

| dataset | 固定入口 |
| --- | --- |
| demo | 青葉ハル、星の航路、青空出版、佐藤アキ2名（漫画家／編集者） |
| 漫画v1／v2 | 各4件：浦沢直樹、長崎尚志、PLUTO、MASTERキートン |
| 科学v1 | ゲッティンゲン大学、ニールス・ボーア研究所、ハイゼンベルク、ディラック |

左の検索の下に「探索してみる」。名称・kind、同名時のみ補助説明を表示。条件なし開始を一行で明示。左ペインが長い時は既存独立スクロールを使用し、Graphの表示領域を変えない。名前を知っている利用者の検索は維持する。ホーム画面・ランキング・Recommendation・presetは追加しない。

StartExamples→chooseRoot(entity, true)。検索のchooseRoot(entity)は既存どおり条件維持。resetConditions=trueではpredicate／制作Roleをnullへ解除し、起点と実効条件を同じ新世代で確定する。旧通信abort・旧ページ／cursor／枝／直前履歴のリセットは検索候補選択と同じ。条件を別の操作で先に変更し旧起点を再取得する実装にはしない。検索語・検索kind・検索結果は独立したまま。Graph内の明示起点切替・直前復帰の契約は変更しない。

START_EXAMPLESの小さいEntitySummaryは凍結datasetのID／名称／kind／descriptionだけ。クライアントに巨大なledger・Source情報を読み込まない。unitで全開始例が正本に一致しIDが重複しないことを検証する。新UI文字列はlocale resourceへ分離し、日本語フォールバックを維持する。Entity名の翻訳とUI labelを混同しない。

## 実ブラウザ観察

科学の[初期画面](science-entry.png)を実際に確認。検索せずに機関や人物を選択でき、毎回名前を入力する手間を省ける。各datasetの全開始例で起点・kindの詳細とneighbors取得を確認する。追加条件設定後に開始例を押すと条件なしへ戻り、旧起点の不要な取得なしで一回のneighbors取得になる。検索入力は空のまま。

開始例には役割や関係条件を隠して適用していない。固定リストの掲載順は信頼度・人気を意味しない。名前だけを知らない利用者に「何が面白いか」を説明する機能まではなく、今回の検証入口として十分かを観察する範囲。

## 変更ファイル

components/StartExamples.tsx、Explorer.tsx、Explorer.module.css、lib/client/start-examples.ts、use-graph-explorer.ts、lib/i18n/start-examples.ts、exploration-entry.ts。tests/ui-state.test.tsx、tests/e2e/start-examples.tsと各datasetの既存specからの登録。PROJECT_CONTEXT／ARCHITECTURE／文書index／root README、設計案と本記録。依存追加なし。

## 検証結果

実行環境は既存検証と同じNode24.21.0／Chromiumライブラリパス。科学3213、漫画3211／3212、demo検証用dev3214を使用する。検証後はdemo3210・科学3213を起動した状態へ戻す。

- unit：既存＋開始例の正本照合・同名識別・callback・条件解除／通信世代分離。
- Playwright：既存探索回帰＋全開始例の入力なし開始・実neighbors・追加条件解除・旧起点を取得しないこと。
- typecheck／lint／build、凍結データ不変と文書リンクを確認。

概要UI、Graphラベル・長名の収まり、歴史的名称の問題は今回再設計しない。次フェーズは新規受入・seedではなく、優先約7候補の資料収集・台帳・5方式比較・小さい意味契約レビューから始める。

| 最終確認 | 結果 |
| --- | --- |
| npm test | 7ファイル158件成功（開始例関連6件追加） |
| npm run typecheck / lint | 成功。既存の同一端点警告1件のみ |
| npm run science:build | 成功。共通Explorer・開始例を含む本番build |
| science:e2e | 既存4＋開始例1、5件成功 |
| pilot:e2e | 既存2＋開始例1、3件成功 |
| pilot:v2:e2e | 8ケースを確認。最終全ケース成功（一部個別再実行） |
| test:e2e（demo dev3214） | 28ケースを確認。最終全ケース成功（一部個別再実行） |
| 既存凍結datasetとfixture | 既存16ファイルのSHA-256一致、科学data／ledger／manifestもGit差分なし |
| 再起動後の科学Cambridge neighbors | HTTP 200。生成キャッシュ404は再現なし |

ブラウザ初回並行runではdemoの検索／開始例が待機timeout、漫画v2の作品検索が503、Canvasクリックが意図と異なるNodeへ入る失敗があった。漫画v2の先行runは途中でSIGTERM終了もあり、成功扱いにしていない。再実行で待機失敗は解消し、新規開始例テストは取得終了を15秒まで待つ。既存v2の実クリック補助はGraph取得と対象Canvas描画を待ち、cy.resizeで現行Canvasサイズを反映してから座標を読むようにした。実クリックをemitや架空応答に置き換えていない。修正後の全展開・座標／共有枝回帰と作品検索は2件とも成功。demo再実行も2件とも成功。APIの5秒予算・本体のGraph配置／クリック契約は変更していない。成功済みのケースと再実行分を合わせて44ケースの最終成功を確認したもので、初回の全suiteが無失敗だったという記録ではない。

今回API・クエリを変更していないため専用integration testは追加しない。unit／実DBを使った各datasetのPlaywrightで起点選択と条件取得の接続を検証した。過去フェーズの自動生成スクリーンショットはGitの元画像へ戻し、今回の画面だけ本フェーズへ保存する。

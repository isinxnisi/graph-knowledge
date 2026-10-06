# Phase 22：Graphラベルの意味優先

2026-10-07。[現行契約](../../design/RELATION_PRESENTATION_CONTRACTS.md)を更新。今回の範囲は、線のlabelを既存ClaimSummaryから作るpresentationと、表示文言・テスト・文書だけ。

## 問題と採用ルール

Phase 21の実画面をdemo／漫画v2／science v2／Eventで確認した。具体語の長さを理由に「立場 2種類」へ置き換えると、VisitorとAssociate professorの意味がGraphから消える。「＋指定なし」は正確なClaim構成でも、二者の関係を読む際に余計な説明が先に目に入る。長いpredicate表示名の繰り返しもラベル面積を使っていた。

構造化済みの具体値がある線は、短い見出しと具体語を改行で表示する。新しいbadgeやDOM overlayは追加せず、Cytoscapeの既存ラベルで読み取れる小さい変更にした。

| 実例 | 変更前 | 変更後 |
| --- | --- | --- |
| 長崎尚志→PLUTO | 制作に関わった／プロデュース＋指定なし | 制作／プロデュース |
| 手塚眞→PLUTO | 制作に関わった／監修＋指定なし | 制作／監修 |
| ハイゼンベルク→NBI | 関わりがあった／立場 2種類＋指定なし | 組織／Associate professor／Visitor |
| Lorentz→特定開催回 | 参加した／会議議長＋指定なし | 参加／会議議長 |
| 浦沢直樹→PLUTO | 制作に関わった | 同じfallback。作画・作者等を補完しない |
| demo・青葉→黒川 | アシスタントだった／肯定・否定あり | 同じ意味と中立的な肯否・点線を維持 |

「／」は表内での改行表現。制作／組織／参加はlocale境界の表示文字列で、taxonomyや保存意味ではない。具体語は既存の三つのdomain辞書から読み、Source・Citation.note・descriptionから推論しない。

具体語はID順の二値まで。二語の合計が区切り込み24 Unicode文字を超える場合は語の間で改行する。長い二値を種類数へ置き換えない。三値以上でも具体語二つを残し「ほかN件」で省略を補助表示する（Nは未表示の限定値数）。順序は正しさ・頻度・重要性を表さない。限定値ごとの「否定のみ／肯否あり」と、線全体の中立的な肯否を維持し、否定だけの値を肯定された役割へ変換しない。

## 詳細と意味の境界

「指定なし」はGraphラベルから外しただけで、Relation概要の内訳と個別Claimに残す。Claim UUID・方向・SPO集約・claimIds・period・scope・肯否・出典は保持する。Graph内／Graph未表示／条件外の関連Claim区分、広いClaimと限定Claimの独立性、個別主張→Citation→Sourceの導線も既存実装を利用する。

具体語のラベルは、全Claimが同じ限定を持つという意味ではない。役割が対象作品の全巻・全期間に掛かるとも推定しない。浦沢の制作関与には役割・刊行物scopeが未構造化のため、ここはpresentationだけでは具体化できない。追加資料・受入・意味モデルの判断は別フェーズである。

Cytoscapeのfont・幅・背景・曲率・Node配置は変更していない。変更は`relationPresentation`のGraph向け具体語／見出しと、`displayRelations`のlabel合成。API・DB・schema・語彙・探索条件・cursor・GraphState・受入状態・凍結datasetには変更なし。

## 実ブラウザ観察

Chromium、1440×1000、既存専用DB/Webで確認。Graphの線を実クリックし、Relation全体から独立主張と根拠まで読むテストを更新した。PLUTOから三制作人物へ入り、プロデュース／監修と、未構造化の浦沢の線を識別する。条件適用後もPRODUCINGの同じ意味ラベルが残り、広いClaimは条件外の詳細として分かれる。

scienceでは三Claimを一線のまま保持し、二つの立場が名前で読める。EventではLorentzの二Claimを一線のまま会議議長として読む一方、Diracは広い参加のfallbackを維持する。詳細では限定なしも確認でき、開催回の期間と各Claimの期間不明を維持する。demoは具体Roleが構造化されていないためfallbackと肯否の回帰例。三値以上や特定Roleの否定は人工テストだけに留め、datasetへ投入していない。

選択状態の一行表示では全改行を「 / 」へ置換し、三行ラベルの具体語が一続きに見えないようにした。表示のみの局所修正で、選択イベントは変更していない。

### 画面記録

| dataset | Graph | 詳細 |
| --- | --- | --- |
| demo | [通常関係と肯否混在](screenshots/demo-graph.png) | 既存のClaim比較・Citation導線をテストで確認 |
| 漫画v2 | [PLUTOの三制作人物](screenshots/manga-pluto-graph.png)／[浦沢のfallback](screenshots/manga-graph.png) | [プロデュースと限定なしの独立主張](screenshots/manga-pluto-detail.png) |
| science v2 | [変更前](screenshots/science-before.png) → [二立場の具体語](screenshots/science-graph.png) | [限定なしを含む三主張](screenshots/science-detail.png) |
| Event | [変更前](screenshots/event-before.png) → [会議議長と広い参加](screenshots/event-graph.png) | [広い参加と議長の独立主張](screenshots/event-detail.png) |

全画像を確認し、具体語の途中切れやNodeとの重なりがないことを代表初期Graphで確認。詳細幅拡大後は既存のpanを保つため、画面外に一部Nodeが出る。レイアウト変更の比較ではなく、ラベルと意味・根拠の連続性を確認したもの。

## 検証

| 検証 | 結果 |
| --- | --- |
| unit / component | 10 files・229成功。具体語保持、四値の省略、否定、広い／限定、期間、根拠から推論しない契約 |
| demo Playwright | 関係表示の2件成功。production WebでSource導線・未表示Claim・ページング・失敗再試行 |
| 漫画v2 Playwright | 11件を確認、10件は初回成功・PLUTO初期取得待ち1件は単独再実行で成功 |
| science v2 Playwright | 6件成功。選択状態の改行修正後にも新表示の1件を再確認 |
| Event Playwright | 6件を確認、5件は初回成功・新表示1件は初期化完了待ちを加え単独再実行で成功 |
| typecheck / lint / production build | 通過。最後の局所修正を含む確認は後述のコマンド |
| predicate / qualification check | error 0。既存のASSISTANT_OF／INFLUENCED_BY意味レビュー警告1件を維持 |
| 凍結・境界 | HEADとの差分でdataset・fixture・語彙・domain・server・APIに変更なし |

計25個の対象Playwrightケースを確認。全demo suite・独立API integration・seedは再実行していない。API／投入／意味処理には変更がなく、4 datasetの実DB取得からGraph・詳細・Sourceへの経路をPlaywrightで検証した。

初回の漫画／Event試験ではneighborsの通信が中断され、中心だけのまま取得待ちになった。サーバー側200応答を確認したが、UI初期化との因果はこのフェーズでは確定していない。共通表示試験はCytoscape Coreの初期化完了を待って開始するようにした。待ち時間やAPIのtimeoutを延長して隠していない。アプリの探索state・通信処理は変更せず、初期化前に即操作する場合の開発環境のレースは別の検証課題として残す。

### 実行コマンド

repoのNode 24.21.0を使用。このホストのブラウザ用共有ライブラリ・既存専用Webを使う場合は従来どおり環境変数を設定した。

```bash
npm test
npm run typecheck
npm run lint
npm run build
GRAPH_TEST_REUSE=1 npm run test:e2e -- tests/e2e/presentation.spec.ts
GRAPH_TEST_REUSE=1 npm run pilot:v2:e2e
GRAPH_TEST_REUSE=1 npm run pilot:v2:e2e -- -g 'PLUTOから別'
GRAPH_TEST_REUSE=1 npm run science:v2:e2e
GRAPH_TEST_REUSE=1 npm run science:v2:e2e -- -g Phase22
GRAPH_TEST_REUSE=1 npm run event:e2e
GRAPH_TEST_REUSE=1 npm run event:e2e -- -g Phase22
git diff --exit-code HEAD -- datasets fixtures vocabulary lib/domain lib/server app/api
git diff --check
```

Nodeは `/tmp/graph-knowledge-node/bin`、ブラウザライブラリは `/tmp/noir-browser-tools/libs/usr/lib/x86_64-linux-gnu` を使用。demoはproductionの3210、漫画v2は3212、science v2は3214、Eventは3215で確認した。

## 残る課題

- 浦沢の作者性／作画等は現在の構造化データでは出せない。ラベル変更の不足と、事実受入・dataset／意味モデルの不足を分離する。
- 長い具体語や三値以上の全値・期間の違いは詳細へ降りる必要がある。小さいGraphラベルに全てを載せる方向には広げなかった。
- 広いAFFILIATED_WITHだけの線は「関わりがあった」のまま。Professor等をCitationから読み取れることと、構造化された立場として表示することは別。
- Nodeや枝が増えた際のラベル重なり・狭い画面での配置は別の可読性課題。今回はレイアウトを変えず、長い内部構成説明を減らした。

# Phase 21：Graphの関係概要とClaim詳細の整合

状態：完了。実装・4 datasetの実画面評価・回帰検証を実施。現行仕様は[関係presentation契約](../../design/RELATION_PRESENTATION_CONTRACTS.md)。Phase 16の基本意味、三typed型、API、DB、語彙・凍結datasetを変更しない。

## 問題と変更

以前は線の限定を読むことと、先頭Claimを比較基準として読むことが混ざっていた。単独の浦沢→PLUTOでも限定比較の参照が前面に出て、肝心のクレジット表記と確認範囲は下にあった。Graph内・条件外・Graph未表示の関連主張も、カード上の補助表示だけではまとまりを見分けにくかった。二Predicateに残る「異説あり」は、期間・限定が違うだけの肯否を自動対立に見せる余地があった。

- Graphは既存SPOの一線集約を維持。構造化済みのRole／立場と指定なしの併存を表示し、全Predicateの混在を「肯定・否定あり」へ統一。元の曲率・位置計算・矢印・破線／点線は維持。
- Edge選択の先頭は「この関係の概要」。表示中全Claimの構成を示し、UUID先頭を意味基準にしない。限定の説明は必要時に展開する。
- 個別主張はGraph内／条件内だがGraph未表示／条件外を区分。詳細確認ではneighborsのcursor・受理範囲を進めず、関連主張をGraphへ追加しない。
- 主張カードへ移動、最初のCitationへ移動するボタンを追加。Sourceのタイトル・参照箇所・URL・原表記／言語・Citation.noteの確認範囲を先に、書誌情報を折り畳みに移した。出典未確認と部分取得・再試行を保持。

## 実画面評価

Chromiumで4環境を操作し、before／afterのスクリーンショットも確認した。これは開発時の観察であり、第三者による利用者評価ではない。

| 対象・経路 | 画面で確認できた価値 | 残る限界 |
| --- | --- | --- |
| demo 青葉→黒川 | 3 Claimが1線。肯定2／否定1は混在として示すだけ。個々の期間と複数Citationへ降りる | 同じ限定でも矛盾を自動判定しない。資料の真偽評価はしない |
| 浦沢→PLUTO→作品展開 | 関係全体が先に読め、参照箇所・制作クレジット「浦沢直樹×手塚治虫」・第1巻商品情報という確認範囲へ移動できる | 作画／著者性は線から分からないまま。この不足を自然なラベルで補完しなかった |
| PLUTO起点→長崎 | プロデュースと役割指定なしを一線内の異なる主張として読める。限定カードのISBNと確認範囲へ進める。PRODUCING条件後は広いClaimが条件外へ分かれる | 同じSourceを二つの独立根拠とは数えない。第1巻クレジットを全巻／その巻だけへ解釈しない |
| ハイゼンベルク→NBI | 立場2種類＋指定なしを短く提示。詳細でVisitor 1924–25、Associate professor 1926–27と広いClaimを分ける。Visitor条件、開閉・復帰も維持 | 広いClaimには立場が構造化されず、元資料へ戻る必要がある。同時在籍／雇用形態を推論しない |
| 特定Solvay会議→Lorentz | 会議議長＋指定なしの2 Claimが1線。仏語Président・locator・Sourceへ降り、Claim期間不明とEvent開催期間を区別 | 参加者数とClaim数は別。長いEvent名や詳細幅変更後の狭いGraphには可読性の余地がある |

今回変えたのは、情報を落とさずに読む順序と移動のしやすさ。浦沢→PLUTOの大事な「何として関わったか」は、現datasetだけでは十分に価値として見せきれていない。PLUTOから他の制作人物へ辿ると、構造化済みRoleによる違いが見え、根拠を読む動機は明確になる。全ての代表例が十分面白くなったとは断定しない。

## 浦沢→PLUTOの原因の切り分け

| 分類 | 実例・判断 | 今回の扱い |
| --- | --- | --- |
| 構造化済み情報の表示不足 | 長崎のPRODUCING、手塚眞のSUPERVISION、科学の二立場、EventのCHAIRと指定なしの構成 | 線・関係概要で表示改善。個別scope／期間はカードへ |
| 原資料／台帳／Citationにあるが未構造化 | 浦沢の制作クレジット原表記と「PLUTO 第1巻の商品情報」という確認範囲。広いClaimのroleId／scopeはnull | 既存noteを読みやすく提示。Role／scopeへ自動転記しない |
| datasetに必要な事実がない | 浦沢が作画したという受入済み限定、全巻／全版／全期間の役割、作品間の原作派生等の構造化知識 | 根拠なく補完しない。凍結版不変 |
| 現契約では足りない意味 | 現Role集合にDRAWINGはない。著者性・原作由来を制作関与と同じ命題にできるとも未決定 | 新語彙／独立命題は次の意味レビュー。typed限定方式が作画を原理的に表せないという結論ではない |

現在の主張は `aacddf82-87ae-4981-8542-0470e981a94f`。v2台帳の「浦沢直樹の具体Role」保留理由は、著者名列だけで作画を断定しないこと。制作Roleレビューも「浦沢直樹×手塚治虫」「著」を作画へ推定しない。今回外部資料を新規受入したものではなく、既存資料記録と受入範囲を画面へ出した。

次は、浦沢→PLUTOのクレジットを意味のある探索情報へするため、どの具体的役割／著者性をどの資料で受け入れられるかを少数例で確認する設計・資料レビューが自然。単に「制作に関わった」を「作者」へ置換したり、すべてを汎用Roleへ載せたりしない。

## 変更ファイルと責務

| ファイル | 責務 |
| --- | --- |
| `lib/client/relation-presentation.ts` / `lib/i18n/relation-presentation.ts` | 表示中Claimの限定・肯否の短い概要、locale境界 |
| `lib/client/graph-presentation.ts` | 既存DisplayRelationへ新概要ラベルを使う。SPOキー不変 |
| `components/RelationOverview.tsx` | 関係全体の構成と限定の説明 |
| `components/ClaimDetails.tsx` | 表示範囲別の独立Claim、移動、Citation優先の情報順、書誌折り畳み、部分取得 |
| `components/Explorer.tsx` / `Explorer.module.css` | 表示中ClaimSummaryの受渡しと既存テーマ内のスタイル |
| unit / cross-dataset Playwright | 中立肯否・三型・資料から推定しない・範囲分離・実資料導線・状態維持 |

API・Cypher・DBモデル・Claim schema・語彙・fixture・pilot data・C09やE02の受入状態は変更していない。Capsule／投稿は対象外。

## 検証

| 検証 | 結果 |
| --- | --- |
| unit / component | 10 files / 226成功 |
| demo実DB integration | API 22＋seed 1、合計23成功（再実行） |
| 漫画v2／science v2／受入済みEvent integration | 各1成功、合計3成功。Eventの人工ケース1件は別環境のため対象外 |
| demo Playwright | 33成功。既存31件＋新2件。locator修正後の全体再実行で成功 |
| 漫画v2 Playwright | 11成功。PLUTO代表経路の画像追加後の該当ケースも成功 |
| science v2 Playwright | 6成功 |
| Event Playwright | 6成功 |
| typecheck / lint / build | 通過。typecheckの生成物整理・再実行は下記を参照 |
| 語彙／限定check | error 0。既存の同一端点組の意味レビュー警告1件を維持 |
| demo＋5凍結datasetのvalidate | 通過。生成物の再現・49ファイルの不変確認 |
| 差分／文書リンク | `git diff --check`と新規・更新した入口のリンク確認が通過 |

新しいUI試験は、線の実クリック、関係全体、表示中のClaim構成、原資料・確認範囲、主張／根拠への移動、Graph座標・選択・pan/zoom不変、詳細からのEntity展開を4 datasetで検証する。ページングの未表示関連Claimを読んでもGraphとcursorを進めないこと、一部取得失敗・再試行、Role条件外の広いClaimも確認した。既存の開閉・休止復元・合流／循環・上限・条件draft・切替／復帰・Entity概要・テーマも回帰対象。

合計unit／component 226件、実DB integration 26件、Playwright 56件が成功。新しい意味やデータを受け入れたことを表す件数ではない。

### 実ブラウザの画像

1440×1000で確認。beforeとafterのGraphのpan／zoomは操作経路により異なる。今回はレイアウト調整の比較ではなく、右詳細の情報順とラベルの意味を比較する。

| dataset | 変更前の詳細 | 変更後の関係全体 | 個別の根拠 |
| --- | --- | --- | --- |
| demo | [before](screenshots/demo-before.png) | [関係全体](screenshots/demo-detail.png) | [Citation](screenshots/demo-source.png) |
| 漫画v2・浦沢→PLUTO | [before](screenshots/manga-before.png) | [関係全体](screenshots/manga-detail.png) | [クレジットと確認範囲](screenshots/manga-source.png) |
| science v2 | [before](screenshots/science-before.png) | [三主張の構成](screenshots/science-detail.png) | [立場の原資料](screenshots/science-source.png) |
| Event | [before](screenshots/event-before.png) | [広い参加＋議長](screenshots/event-detail.png) | [仏語資料と限定](screenshots/event-source.png) |

PLUTO起点の[三制作人物の線](screenshots/manga-pluto-graph.png)、[長崎の広い＋限定](screenshots/manga-pluto-detail.png)、[PRODUCING条件後の表示中／条件外](screenshots/manga-filtered.png)も確認した。浦沢の具体Roleは未指定のまま、他の二人物ではプロデュース／監修の違いが線から分かる。

demoの[未表示の関連主張](screenshots/demo-unseen.png)も記録した。Graphは2 Claimの受理ページのまま、線に含まれない同条件の関連主張2件を比較できる。

### 再現するコマンド

repoのNode指定は24.21.0。このホストはNodeを `/tmp/graph-knowledge-node/bin`、ブラウザ用ライブラリを `/tmp/noir-browser-tools/libs/usr/lib/x86_64-linux-gnu` から使用。既存4 Web環境を使う時だけ `GRAPH_TEST_REUSE=1` を指定する。

```bash
npm run build
npm run typecheck
npm run lint
npm test
# 起動済みのdemo production Webを使用する場合
API_TEST_BASE_URL=http://127.0.0.1:3210 npm run test:integration
npm run pilot:v2:integration
npm run science:v2:integration
npm run event:integration -- -t 受入済みEvent
GRAPH_TEST_REUSE=1 npm run test:e2e
GRAPH_TEST_REUSE=1 npm run pilot:v2:e2e
GRAPH_TEST_REUSE=1 npm run science:v2:e2e
GRAPH_TEST_REUSE=1 npm run event:e2e
npm run fixture:validate
npm run pilot:validate
npm run pilot:v2:validate
npm run science:validate
npm run science:v2:validate
npm run event:validate
git diff --check
```

test:integrationとdemo PlaywrightはDB停止・一時データ操作の影響を避けて直列実行する。制作／科学integrationの人工補助データはテスト内で削除し、終了時のDB snapshot一致を確認している。Event integrationは今回、受入済み実資料ケースを実行し、別Web環境3216を要する人工ケース1件は対象外。凍結49ファイル（datasets／fixtures／vocabulary）のSHA-256を開始HEAD `475c246` と照合し、差分0を確認した。

### 手元で画面を確認する

- demo： http://127.0.0.1:3210 → 青葉ハルの開始例 → 黒川への線。
- 漫画v2： http://127.0.0.1:3212 → 浦沢直樹 → PLUTOの線 → 根拠を読む。PLUTO開始例では長崎・手塚眞の限定付き線と比べられる。
- science v2： http://127.0.0.1:3214 → ハイゼンベルク → NBIの線 → 三主張と立場・期間。
- Event： http://127.0.0.1:3215 → 特定開催回 → Lorentzの線 → 広い参加／会議議長と仏語Source。

稼働中のローカル環境を記載したもので、常設公開URLではない。環境を停止した場合はREADMEのdataset別起動手順に従う。

### 実行環境の注意

最初のdemo統合実行はUI検証・buildと並行し、503が5項目、DB停止後の復旧待ちが1項目失敗した（17成功／6失敗）。アプリのDB待ち上限は既存の5秒で変更していない。並列負荷の寄与が疑われたため、UI実行を分け、既にbuildしたproduction Webを `API_TEST_BASE_URL` で使い、読み取り到達を確認して再実行。DB停止・実際の再起動を含む23件が通過した。最初の失敗は記録に残し、新UIだけの問題と断定しない。

このホストのNeo4j healthcheckはcypher-shell起動だけでも10秒を超える。Phase 20から残る `/tmp/graph-knowledge-phase20-health.yaml`（healthcheck timeout 60秒／interval 15秒）をCompose実行時だけ使用した。repoのCompose定義・アプリ設定は変更していない。

typegenと別プロセスのdemo devを並行した際、Next自動生成の `.next/dev/types/validator.ts` に不完全な追記が残りtypecheckも一度失敗した。該当自動生成ファイルだけを削除し、devの終了後にtypegen／typecheckを直列再実行した。型やtsconfigを緩めて通したものではない。今後この検証はbuild・typegen・同じdistDirのdevを分けて実行する。

demoの新しい失敗再試行ケースでは、テストの全画面 `getByRole("alert")` がNextの空のroute announcerも拾い、最初はlocatorの重複で失敗した。画面には期待する部分取得エラーが出ていた。検証対象をClaim詳細のalertへ限定して修正し、該当ケースの単独実行は通過した。アプリのエラー表示を削除して通したものではない。

## 残るUI課題

役割／立場が多い線は種類数への圧縮になり、具体語は詳細を開く必要がある。長いEvent名・密な全展開Graphでのラベル読みやすさ、詳細を広げた際に縮むGraph領域は今後の局所調整候補。pan/zoomの勝手な変更を避けるため、詳細幅変更で全体を自動fitする挙動は追加しなかった。

Graph未表示の理由を現在のAPIだけで未取得／閉じた枝等へ断定できない。公開関連Claimが多い場合、全詳細取得と縦の比較は長くなる。今回の小さいdatasetでは成立するが、大量公開データ向けの取得契約を解決したわけではない。

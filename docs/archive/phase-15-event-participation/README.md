# Phase 15：特定Event参加・三用途typed限定の完了記録

2026-10-06。ユーザーがE01/E03、特定開催回の同一性・開催期間、Lorentzの広い参加／CHAIR別Claimへの投影を明示受入した。受入前の人工検証は[別記録](IMPLEMENTATION_BEFORE_ACCEPTANCE.md)。現行仕様は[Event参加契約](../../design/EVENT_PARTICIPATION_CONTRACTS.md)、判断原本は[受入記録](../../../datasets/pilot-event/v1/ACCEPTANCE.md)とdataset台帳。Phase 16の実装は行っていない。

## 実投入と凍結

科学v2の8 Entity・10 Claimを対照としてコピーし、Lorentzと特定Eventを追加した専用`pilot-event-v1`。系列全体のEventを作らない。未確認の外部IDは追加せず、Diracの既存内部IDを使う。

| Node | 件数 | Relationship | 件数 |
| --- | ---: | --- | ---: |
| Entity | 10 | SUBJECT | 13 |
| Claim | 13 | OBJECT | 13 |
| Source | 11 | HAS_CITATION | 15 |
| Citation | 15 | CITES | 15 |
| ExternalIdentifier | 8 | HAS_EXTERNAL_ID | 8 |
| 合計 | 57 | 合計 | 64 |

新規実資料Claimは3件、Sourceは2件、Citationは4件。E01の広い参加は議事録S12、CHAIRはS11公式索引とS12、E03の広い参加はS12。根拠の重複を独立Sourceの増加と見なさない。全件affirmedで、実在deniedは創作していない。

Event開催期間は1927-10-24〜1927-10-29、granularity=occurrence。三つの参加Claim.periodは両端null。全日程・全session参加、Diracの議長／発表者、シリーズ職、委員会・名誉議長を推論しない。E02はpending-not-for-runtimeのまま、招待をRoleへ、欠席をdenied参加へ変換しない。科学C09も保留のまま。

[初回seed](seed-first.json)は57 Node／64 Relationship作成、[確定生成物の再seed](seed-final-repeat.json)は0／0。実DB統合テストでも二度seedして属性snapshotの一致を確認した。既存demo・漫画v1/v2・科学v1/v2・研究台帳等の[36凍結入力](frozen-inputs.json)はcommit 64ad4b8と完全一致。旧predicate意味も不変。分離DBは検証のためで、分野ごとの製品Graph分割ではない。

初回投入後、生成Citation.noteにLorentzの広い参加／議長投影の説明がDiracにも付いていたことを発見。Lorentzに説明対象を明記し、Diracからその文を除去する局所修正とテストを追加した。通常seedは属性不一致を拒否した。新規専用DBの該当4 Citationだけ、ID・Source・旧注記一致を確認する一回のパラメータ化transactionで確定注記へ揃えた。旧凍結入力・意味・期間は変更せず、一般upsertや自動migrationへ拡張していない。最終生成物からの再seedとsnapshot確認が冪等性の証拠である。DB起動完了前の最初の接続失敗は成功seed回数に含めない。

## 実ブラウザで確認した経路

- 開始例の第5回ソルヴェイ物理会議（1927）→Entity3／Claim3／表示Relation2。開催期間はEntity詳細、参加Claimは期間不明。
- Lorentzの線／テキストから詳細。広い参加と会議議長限定を縦に比較し、Chair/en、Président/fr、S12のPDF第12ページ／印刷VII、1928年出版、Source URLへ戻れる。
- 会議議長条件→Entity2／Claim1。広い参加Claimは条件外の主張として詳細へ残る。開始例では三条件を解除。
- Diracの開始例→既存NBI／CambridgeとEventへ。Eventを展開してLorentzへ、広く見る→直前復帰。受理範囲・選択・座標・pan/zoomを比較。
- Event→Dirac→NBI→Heisenberg→Göttingen→全10 Entity／13 Claim／10 Relation。共有組織を重複させず、Event起点を閉じて1／0、再開して受理済みの子孫と座標を復元。
- 三条件（制作SUPERVISION・組織VISITOR・Event CHAIR）のdraft取消ではGraph不変。適用後はEvent起点の議長Claimだけ。Lorentzを同条件起点→直前復帰→広く見るで広い参加＋議長を取得。
- 人工契約では三条件を同時に持つ人物で、それぞれのpredicateだけに作用すること、否定議長が広い参加へ波及しないこと、ページングと通信途中の旧世代排除を確認。実資料にない肯否反例を実データへ混ぜない。

確認は実DBに対するPlaywright操作とスクリーンショットの目視であり、一般利用者の評価実験ではない。

## 人工検証との差と表示の観察

実資料の長い日本語名は、Cytoscapeの既定の単語折り返しだけではNodeから大きくはみ出した。Nodeの`text-overflow-wrap: anywhere`を追加し、長名を数行へ収めた。配置・曲率・API・Claim意味は変更しない。ひし形の斜辺付近には文字が寄り、全展開では小さい文字と長名の途中改行が残る。

仏語の原語とlocator、Sourceの長い題名は詳細を広く読む状態で自然に折り返す。ただし受入範囲・限定説明が長く、Citationを順に読むためのスクロール量は多い。詳細幅を広げるとGraphの右側が切れることがある。pan/zoomは維持され、全体表示で収まるが、自動fitへ変更はしていない。

Event自身の期間とClaim期間不明は別欄で読めた。GraphのLorentz一本線は「参加した／会議議長」と圧縮し、広いClaimの存在・期間・原語を詳細へ委ねる。取得済み範囲だけのRole概要であり、全日程・全sessionの認定を意味しない。

関係概要は「参加者関係についての主張／肯定3件」。接続人物は2、表示Relationも2のままなのにClaim数だけ3となる。「どんな関係が伸びるか」を掴むには統計が強く、広い／限定の重複を知らない人には人数に見える余地が残る。これはoverview presentationの課題であり、参加predicateやClaimの統合で解消しない。今回概要を再設計せず、次のUI判断材料として記録する。

[初期Graph](event-initial.png)／[全展開](expanded.png)／[仏語Sourceとlocator](event-french-source.png)／[三条件](three-conditions.png)／[Entity概要](event-overview.png)／[実API応答](API_EXAMPLES.json)。

## 三用途の仮説評価

| 共有できた責務 | domain固有に残した責務 |
| --- | --- |
| 固定型の適用predicate・strict payload・enum検査 | 制作Role、組織の制度語、会議議長の狭い意味 |
| 原表記＋languageの小さい保存schema | 原表記の翻訳・制度差・Sourceの受入判断 |
| null/未指定/空集合、条件正規化・一致、LIMIT前filter | publication scope、組織立場の期間、Event同定・開催期間 |
| 比較キー、polarityの対象、cursor実効条件拘束 | domainごとの固有payload・DB mapper・ラベル・説明 |
| GraphState、世代、ページ受理、開閉・休止復元、snapshot | dataset投影と根拠確認、開催期間を人物期間へ転記しない判断 |

三条件の固定API引数・nullable fieldとcursor v4、GraphStateは今回の範囲で管理可能だった。条件は新しい探索世代にまとめ、snapshotは三条件も保持する。これを根拠に、型の増加を無制限に同じ引数・fieldへ追加する方式まで固定するものではない。

第三型でも別のstate管理や自由query generatorは不要だった。PARTICIPATED_INは独立の参加命題として自然。今回の「参加者として記載された会議議長」はtyped限定CHAIRで自然だったが、非参加の議長職へ一般化できる検証ではない。E02反例は招待と参加を分ける境界を支持する。Event開催期間はEntity属性であり、共通Claim限定へ押し込まない。

Phase 14の仮説を壊す意味上の反例は今回の受入範囲では出なかった。ただし「一つの共通Role enum」「共通形式から資料の意味も受入できる」「Graph線数とClaim統計が一致する」という拡張は成立しない。三用途の成功は万能ontologyの証明ではない。

## Phase 16で固定してよい原則／固定しない事項

固定してよい候補は、独立命題差はpredicate、同命題内の立場はdomain固有typed限定、機械処理だけ小さく共有する境界。strictな型・適用先、原語＋language、nullと条件省略の分離、LIMIT前条件、条件拘束cursor、世代／復帰、UUIDと比較キーと表示束の分離、人間受入とschema検証の分離、Entity期間からClaim期間を推論しない原則を基本設計へ整理できる段階にある。

まだ固定しないのは、全domain共通値体系、自由qualifier、任意型登録・動的フォーム、万能Cypher、全Eventの一般schema、非参加CHAIRの扱い、招待predicate、開催回とシリーズの関連モデル、概要の表示単位、時点別名称、多段履歴・永続化。既存の五predicate・三固定型を越える採用は別の意味レビューを要する。

## 検証結果

検証時はNode 24.21.0を使用し、この環境のPATH=/tmp/graph-knowledge-node/bin:$PATH、既存Chromium用LD_LIBRARY_PATHを指定した。製品設定へこれらの作業用パスは固定しない。

途中の失敗は、専用DB起動前の接続拒否、複数DB同時起動時の503、ブラウザで取得完了前にsnapshot／次ページ操作したテストの競合、locatorの完全一致誤りだった。実Canvasのクリック後は選択クラスまで待ち、ページごとの受理件数まで待つ検証へ修正した。クリックの既存300ms契約やDB timeoutを広げていない。Next devとtypegenの並行生成後に残った不正な生成validatorは、dev停止後に生成directoryだけを作業用tmpへ退避し再生成して解消した。ソースやtsconfigの型検証を緩めていない。本番Event buildで実資料の全4経路が成功した。旧検証環境は逐次起動して回帰を行う。

最終結果：

| コマンド | 結果 |
| --- | --- |
| `npm run event:prepare` / `event:validate` | 受入台帳・生成物・manifest・研究hash一致。10 Entity／13 Claim |
| `npm run event:seed`（再実行を含む） | 初回57／64、確定生成物の再実行0／0、snapshot不変 |
| `npm run vocabulary:check` | 5 predicate／4制作Role、error 0。既存同端点組の人間確認warning 1 |
| `npm run qualification:check`（lint/test内） | 独立3型／組織2立場／Event1立場、error 0／warning 0 |
| `npm run test` | 9ファイル・195件成功 |
| `npm run event:integration` | 人工・受入実資料の2件成功。両視点・LIMIT前条件・cursor v4・注記・Source・期間・冪等性 |
| `GRAPH_TEST_REUSE=1 npm run event:e2e` | 受入実資料4経路成功。本番Event buildで確認 |
| `GRAPH_TEST_REUSE=1 npx playwright test --config=playwright.event-contract.config.ts` | 人工3経路成功。肯否・旧通信・三型同時取得・ページング |
| `npm run science:v2:integration` / `science:v2:e2e` | 統合1件／ブラウザ4経路成功 |
| `npm run pilot:v2:integration` / `pilot:v2:e2e` | 統合1件／ブラウザ8経路成功。実Role・scope・条件・作品起点・復帰 |
| `API_TEST_BASE_URL=http://127.0.0.1:3210 npm run test:integration` | demoの22件成功。DB停止503／再起動・属性不変を含む |
| `GRAPH_TEST_REUSE=1 npm run test:e2e` | demo全28経路成功。Node操作・上限・旧通信・Relation詳細・テーマ・起点復帰 |
| `npm run science:integration` / `science:e2e` | 科学v1の実DB1件／ブラウザ5経路成功 |
| `npm run typecheck` / `npm run lint` | 成功 |
| `npm run build` / `npm run event:build` | 両本番build成功 |
| 凍結入力・語彙catalog・文書リンク検査 | 36入力と既存catalog不変、リンク有効 |

統合テスト計27件、Playwright計52経路、unit/componentを含む195件成功。再実行した同じ経路を加算していない。回帰テストが再生成したPhase 09/10/14の過去画像は当時の版へ戻し、今回の実画面はこのPhase 15だけへ保存した。既存の検証DBを一時停止して逐次実行し、検証後に元の起動対象を再開した。

確認URLは **http://127.0.0.1:3215**。初期画面の会議開始例→Lorentzの線／主張詳細で、広い参加と会議議長、開催期間と参加期間不明を比較できる。再現コマンドは[dataset README](../../../datasets/pilot-event/v1/README.md)。

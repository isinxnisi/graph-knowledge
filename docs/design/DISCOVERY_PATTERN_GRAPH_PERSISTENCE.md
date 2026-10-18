# Discovery共通関係条件：STEP 3b Graph編集・保存・復元

**操作契約の更新（2026-10-19）**：本書の経路単位open・初期経路表示・点線ハンドルに関する記録は以前の実装経緯。現行は[Graph操作統一](DISCOVERY_GRAPH_ENTITY_INTERACTION.md)と[共通契約§7・8](DISCOVERY_RELATION_CONTRACT.md#7-graph状態編集自由探索)を優先する。完全経路の検証と旧APIの意味は維持する。

2026-10-18〜19。[設計契約](DISCOVERY_RELATION_CONTRACT.md)と[STEP 3a実行基盤](DISCOVERY_PATTERN_GRAPH_EXECUTION.md)を再利用した実装記録。初回patternは `other-works` revision 1のみ。Discoveryのプリセット／対象検索接続はSTEP 4に残す。本番・公開KG・収集処理は変更しない。

## Graphでの操作

公開KGの作品を開き、「見る関係を編集」から「一段の関係」「同じつくり手の別作品」を選ぶ。後者は `作品 ← 人物 → 別作品` の完全経路で、両段affirmed・選択した制作Roleを適用する。別の対象を自動選択しない。人物・非公開datasetではパターン選択を無効にする。

下書きは適用までGraphを変えない。取得・検証に成功してから一括切替し、失敗／キャンセルでは旧Graphを維持する。適用中はCanvas操作を止める。一段の既存predicate・制作Role・所属区分・参加Roleを維持し、新方式では肯定限定も編集できる。パターン選択が一段設定を置換することを明記する。

パターン時は完全経路の和集合を描画し、下の経路一覧から経路単位で開閉・元Claimの根拠確認ができる。通常近傍の展開ボタンは出さない。候補・根拠の範囲はSTEP 3aと同じ（組ごとに検証したClaim対、全Claimではない）。追加取得・表示上限・Abort・revision変更の実行処理は3aを再利用する。

Graphの条件表示の近くに「自由探索に切り替える」を置く。同じ作品・CONTRIBUTED_TO・同じRole集合・affirmedを保持し、2段の形だけを解除して取得し直す。成功した切替だけUndo対象となり、前の経路の開閉・選択・viewへ戻れる。Undoで公開revisionが変わっていた場合は旧キャッシュを復活させない。

## 保存・共有の実装契約

| 対象 | 新形式と旧形式の扱い |
| --- | --- |
| View | collection v2／item v2。root＋relationの意図だけを保存。再訪時は現在のKGで再実行し、新しい証拠になり得る |
| Workspace | collection v3／item v2。relationとadjacent branchesまたはpattern routes・open・requiredRouteKey・candidateBoundary・observedRevision・viewを保存 |
| URL | 圧縮payload v2 `{v,d,r,c,x,o,p,z,l}`。旧v1 decoderとviaの端点・Claim・revision検証を維持。viaからpatternを推定しない |

`lib/client/saved-workspace.ts`のschema／再構築を共通化。旧Workspace単体v1／collection v2、旧View collection v1は先に旧schema・旧正規化で検証し、adjacent／either／all-recordsへ変換する。null・空集合・具体Role集合・枝・ID・時刻・配置を保つ。明示した全predicate集合を旧GETのnull正規化へ渡さず、共通条件付きneighborsとcursorを使う。

新Viewは旧key＋`:v2`、新Workspaceは旧key＋`:v3`。新keyがない場合だけ旧keyを読む。読み取りで書かず、最初の明示編集で検証済み全件を一度のsetItemへまとめる。書込失敗・未知版・破損・競合では元データを保つ。最後の削除も空collectionを書き、旧keyからの復活を防ぐ。旧keyは削除しない。

Workspace／URLのpattern復元は `POST /api/discovery/paths` のrestoreへ全RouteRefを渡す。閉じた経路も元Claim・方向・Role・肯否・非再訪を検証する。一つでも欠ければGraphを部分的に復元しない。observedRevisionが古くても、全参照が現版で成立すれば開閉意図を保って復元し、その旨を表示する。候補の継続は3a契約に従い必要なら先頭から再開する。

失敗時は再試行、または明示的な「同じ条件で探索を再開」を選べる。後者だけが保存参照を再現せず、同じ対象・条件で新しい候補を取得する。保存自体は変更しない。未知のpatternや壊れた条件を単純関係へ置換する復旧は行わない。

10 Workspace・40 adjacentページ・100経路・既存表示／cache上限を維持。単体ファイル100,000 bytes、URL4,000文字目標／8,000文字上限・展開後100,000 bytes。本文・cursor・通信状態・runtime recenterを保存せず、上限で条件や経路を削らない。

## 重点検証

- 新規 `tests/pattern-persistence.test.tsx` 33件：完全参照・閉鎖経路・候補境界・新版・欠落／否定／方向／Role／不完全経路・Abort・保存拒否・旧key保全・空collection・壊れた新keyのfallback禁止・旧URL・上限・draft／取消・自由探索とUndo。
- 関連単体は重複を除き320件成功。旧Graph、否定Claim、根拠、View／Workspace／URL、旧via、検索・旧経路・clientを確認。未知条件や一部欠落の期待を緩めていない。
- 既存保存テストのfixture／期待値を新形式へ追従し、実際の旧v1／v2入力を読む移行試験を別途保持。旧E2EのURL検査も新canonical relationへ追従した。
- Canvasの切替で新しいNodeを原点へ重ねていた問題を実画面から特定。共通Node位置を保ち追加配置してからfitするよう修正し、再現テストと既存motion試験で確認した。
- 実データ操作：PC日本語／390px英語で、編集の取消→pattern適用→10経路→根拠→開閉→View／Workspace保存→URL再読込→自由探索→Undo→Workspace再開→View再実行が成功。新機能の試験は `tests/e2e/pattern-persistence.spec.ts`。広範囲の全E2E・全データ量性能の再調査は行わない。

## STEP 4への引継ぎ

- `applyRelation(entity, relation, witness?, view?, signal?)` はSTEP 2証拠を受け取れる。条件に適合しない対象は拒否し、代表対象を自動選択しない。
- 対象検索→Graphは証拠revisionを厳密固定。保存Viewは意図の再実行、Workspace／URLは保存した全参照の再検証。この3つを混同しない。
- Discoveryの既存3タブ・プリセット・対象選択UIは変更していない。既存のGraphへのadjacent URL生成は互換入力として新encoderを利用する。
- 一般利用導線はGraph編集のみ。Discovery側で条件を設定して成立対象一覧へ進む接続、総合的な日英・PC／スマホ回帰とUX評価はSTEP 4で行う。
- 初回以外のpattern、段別Role、期間重複・scope一致、任意長は未対応。既存の自由探索・旧経路機能を削除しない。

## 反映・時間

3200／betaは最終build `9HrtRX57IlhHm1HO90_XB`、公開revisionは前後とも `82b01515-594c-48ca-b4b6-515eefac83ca`。ローカルHTMLとbetaの実ブラウザHTMLでbuild一致、dataset APIで同版を確認した。3200で新操作PC日本語／390px英語の2件と、旧Discoveryプリセット→根拠→Graph→Back／編集の1件を確認。中止済み要求の早期拒否を単体で補強し、最終buildでもbetaの新操作PC日本語1件が成功。VPSへは配置していない。

最終操作中の経路POST応答は3200で初回135ms・以後71〜110ms、betaで初回230ms・以後132〜162ms。DBは準備済みで、cold保証や高次数の追加負荷試験ではない。高次数・直接証拠検証の取得能力／15秒期限はSTEP 3aと同じ。経路の保持数とURL長には上限があり、URLに収まらない探索はWorkspace／JSONを使う。スマホでは全経路fit後のラベルが小さくなるため、既存の選択へ注目／ズームを使えるが、読みやすさと編集UIの細部はSTEP 4の人間評価に残す。

| 工程 | 概算と時間がかかった理由 |
| --- | --- |
| 必要な確認 | 約2分。ロック、契約、既存保存／編集処理の確認のみ |
| 実装・テスト／fixture作成 | 約20分。保存とURLの版移行、Graphのdraft・復元の接続が中心 |
| 単体・ブラウザ実行／再試行 | 約4分。関連範囲のみ。既存の非表示ボタンを指すUI試験を実際の保存ペイン経由へ修正。実画面で見つけたCanvas配置の不具合は再現試験を追加して修正 |
| build・型・lint・反映 | 約4分。public buildは5回とも成功（約35／36／31／22／21秒）。文言・復旧処理・Canvas修正・中止済み要求の保護を含めて配置し直した。重いDB試験・Docker操作との同時実行なし |
| 差分確認・引継ぎ記録 | 約6分。版の境界・失敗時の保全・実画面を確認 |

一部は待ち時間と重複する概算。長いCPU／メモリ／ディスク競合、Neo4j・Docker待ち、クエリtimeoutは観測していない。APIの大規模な性能再調査は行っていない。STEP 3bで停止し、STEP 4の実装は別途確認する。

## patternの初期展開・再展開修正（2026-10-19）

### 原因と表示・操作契約

`mergePatternPage`が取得した全経路をopenにし、`toggleEntity`のpattern分岐は閉じる処理だけを呼んでいた。さらに`closePatternNode`が操作したEntity自身を投影から除くため、Graphから再開する対象も失われた。初期展開と再展開不能は、ともに取得済み経路と表示・開閉意図を十分に分けていなかった問題である。修正前3200ではPLUTOが10 Entityで始まり、起点を閉じた後は1 Entityのまま再開できなかった。

- 初回はrequiredRoute（なければ先頭候補）の**完全経路1本**だけを開く。PLUTOは3 Entity／2 Claim。残りの候補も検証してcacheへ保持し、追加ページ取得で勝手に開かない。「表示中／取得済み」を分け、選択Entityの「経路をもう1本開く」と既存経路一覧で広げられる。
- Entityの開閉は、そのEntityを通るopen経路集合を一括で閉じ、同じ集合を再開する。起点以外も**線のない点線枠のEntity**を再開用に残す。起点を閉じたときは他の孤立ハンドルを除く。共有Entity・Claimはほかのopen経路が必要なら保持する。
- PCのダブルクリック／タッチの二度押しをpatternのtoggleへ接続。通常探索の概要表示・選択後の開閉契約は維持する。既存の選択・配置cacheを使い、開閉だけでは再配置・fitしない。
- 経路線は常に検証済み完全経路の和集合。孤立Entityは経路成立を示す線ではない。再開前のrevision照合、Abort、遅着応答の排除、表示上限超過時の集合全体拒否を維持する。ページ受理はcache上限、実際に開く操作は表示上限を評価する。

閉鎖後の再開を一覧だけに任せる案はGraphからの探索を途切れさせる。初回を起点だけにする案よりも、成立例1本を見せて経路の意味を理解できる方を採用した。検索条件・関係パターン・根拠の意味、APIは変更しない。

### 保存と互換

runtimeの`collapsedNodes: Record<EntityId, RouteKey[]>`を、Workspace／共有URLの既存v2 executionへ任意の`collapsedNodes: {id, routeKeys}[]`として保存する。Entity・キーの重複、未受理キー、Entityを通らない参照は拒否。全保存経路を元Claimから再検証してから、open状態と孤立ハンドルを復元する。本文や未検証の線を保存しない。

旧v2でこの項目がなければハンドルなしとして読む。旧保存のopen状態を新しい初回1本の規則で上書きしない。Viewは従来どおり意図の再実行なので新しい初回表示になる。collection版・storage keyは不変、新メタデータを知らない旧strict readerの前方互換は保証しない（単純条件へ縮退させない）。Undoは実行状態に含めてそのまま復元する。

### 重点試験

`tests/pattern-node-expansion.test.tsx`の18件で初回・追加候補・3位置の反復開閉、共有Claim、集合の一括再開／上限拒否、revision衝突・Abort後の遅着、保存／URL、旧v2、不正ハンドルと欠落Claimを確認。関連Graph状態・client・Canvas・保存形式・旧URL・Workspace・UI状態・motionを合わせ、分割実行で重複を除き253件成功。型検査・変更ファイルlint・public buildも成功した。

実画面の`tests/e2e/pattern-node-expansion.spec.ts`ではPLUTOの実データを使い、PC日本語1280px／タッチ英語390pxで次を確認する：初回1本、起点・中継・終点を各2往復、実際のマウス／タッチ操作、座標・pan・zoom不変、共有経路と一覧の一致、閉じた共有Entityを含むURL／Workspace再読込、自由探索の反復開閉とUndo。`pattern-persistence.spec.ts`で根拠・View再実行を含む旧3b操作も維持する。

3200で両試験のPC／タッチ計4件、betaでEntity開閉試験のPC／タッチ計2件が成功。代表経路は `PLUTO ← 長崎尚志 → BILLY BAT`、共有経路は同人物から `MASTERキートン Reマスター`。保存後も各Claim・経路の開閉と孤立Entityからの再開を確認した。ページエラー・横のはみ出しはなかった。旧E2Eの件数だけを待つassertが新しい初期状態と同数になったため、URL更新を経路ごとのopen状態で待つよう修正した。Undo後もURL更新を待って評価する。アプリの期待値を緩める変更ではない。

3200／betaはbuild `K5vv33TkC2eRlKupX8HWt`で一致。公開revisionは前後とも`82b01515-594c-48ca-b4b6-515eefac83ca`。通常のHTTP取得はbetaの保護機構で403だったため、実ブラウザでHTMLのbuildとdataset APIを確認した。正式VPS・公開KG・収集処理は変更していない。STEP 4へは進まない。

概算所要時間：約30分（既存確認・原因切分け4分、実装と試験作成13分、単体／ブラウザ確認と再試行7分、build・型・lint・反映2分、差分確認・記録4分。一部待ち時間と重複）。public buildは1回45秒、PC／タッチの旧3b操作で経路POSTは初回111／88ms・以後52〜185ms。API／クエリ変更はなく、大規模な負荷測定はしていない。重いDB試験・Docker操作を並走させず、環境の長い停止やクエリtimeoutは観測していない。

残る操作評価：点線ハンドルが「未表示の経路を再開できる対象」と直感的に伝わるか、選択Entityに対する1本追加と閉鎖／再開の使い分け。未取得ページへ自動展開せず、追加取得と経路選択は既存の明示操作を維持する。少数経路に抑えた初期表示を今回の評価基準とし、全面的なレイアウト調整は行わない。

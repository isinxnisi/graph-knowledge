# Discovery共通関係条件：STEP 3a Graph実行基盤

2026-10-18。[設計契約](DISCOVERY_RELATION_CONTRACT.md)と[STEP 2](DISCOVERY_TARGET_SEARCH.md)を再利用する。other-works revision 1のみ。Graph編集UI・保存形式／URLの移行・Discovery接続は未実装。3タブ・デザイン・公開KG・収集処理・正式VPSは変更しない。

## APIと実行

- `POST /api/discovery/paths` を追加。要求／応答は設計契約§6のpage／restore。strict schemaは `lib/domain/pattern-graph.ts`、実行は `lib/server/pattern-graph.ts`。旧GETの有界探索・肯否の意味は維持する。
- pageは端点UUID列順の12候補＋13件目。各段の最小Claimを選び、並行Claimの組合せで候補を水増ししない。指定証拠は `verifyRelationWitness` で直接検証し、候補ページの外でもrequiredRouteへ含める。指定なしではSTEP 2と同じ最初の完全証拠を取得する。
- candidate cursorは `v:1, operation:"pattern-page"`、root／conditionKey／公開revision／person・workの境界を束縛。対象検索・旧GET経路・neighborsのcursorとは別。続頁はrevision必須。指定証拠を候補ページの境界として流用しない。
- restoreは最大100経路の元Claimを直接再検証し、1本でも不正なら全体失敗。境界を別に検証し、同revisionのみresumable。版が異なればrestartとし、成立している参照・開閉意図は保持する。空参照の成功を「経路なし」と解釈しない。
- 公開性・正規方向・kind・Role・全段肯定・非再訪を共通検証する。scope・期間・Source数は既存mapperの値を保持し、根拠詳細APIへ同revisionで進める。経路から直接関係・因果を生成しない。
- 入力64KiB、重複／未知キー拒否、全体15秒・既存DB timeout・Abort・no-storeを、STEP 2から分離した `relation-http.ts` で共用する。400不正参照、404rootなし、409公開版変更、503未確認、500内部不整合。timeout／取得失敗を0件や部分成功にしない。

例えばSTEP 2応答の `items[0]` を使い、次を同endpointへ送る。`relation`／revisionは対象検索からそのまま引き継ぐ。

```ts
{
  version: 1, dataset: "public-kg", rootId: item.entity.id,
  relation: search.criteria.relation, revision: search.revision,
  operation: { type: "page", after: null, requiredWitness: item.match.witness }
}
```

restoreではoperationを `{type:"restore", routes, observedRevision, candidateBoundary}` にする。現在版で再検証する場合は要求revisionをnullにする。これは保存形式の変更や自動的な再公開ではない。

## Graph状態と描画

`GraphState.execution` はadjacent／patternを区別する。旧メモリ状態で省略されている場合だけadjacentとして読む。新実行の意味は `GraphState.relation` 一箇所を正規条件とし、旧flat条件はadjacentの互換投影として残す。patternを旧predicateへ縮退させない。

patternはRouteRefごとのopen意図、requiredRouteキー、candidateBoundary、cursor、request番号を保持する。`mergePatternPage`／`restorePatternGraph` は検証済み完全経路の和集合を投影する。閉じた経路の共有ノード・Claimは、ほかの開いた経路が必要とする間だけ残る。指定証拠と候補が同じ端点列なら一度だけ表示し、先に受理した証拠を保持する。候補に再登場しても閉じた経路を勝手に開かない。

2026-10-19のGraph操作修正で、初回は証拠1本のみopen、追加候補はclosedとした。Entity閉鎖時の経路集合と孤立した再開用ハンドルを任意の`collapsedNodes`へ保持する。再開は記憶した集合を一括適用し、線は常に完全経路だけを投影する。候補ページの受理はcache上限、経路を開く操作は表示上限でそれぞれ拒否する。詳しい保存互換・実画面検証は[3bの操作修正記録](DISCOVERY_PATTERN_GRAPH_PERSISTENCE.md#patternの初期展開再展開修正2026-10-19)を参照。

表示100 Entity／200 Claim、cache400／800、保持100経路。ページ全体が収まらなければcursor・cache・経路を進めず拒否する。個別経路も全段をまとめて受理／開閉し、欠けたClaimを無視して片段だけ表示しない。patternのcacheを通常の近傍取得済みページとして登録しない。

`useGraphExplorer` の内部入口は以下。既存画面へボタン・タブは追加していない。

| 操作 | 責務 |
| --- | --- |
| `applyRelation(entity, relation, witness?)` | 新条件を取得・検証後に一括確定。失敗／取消は旧Graphを保持。patternに不適合なkindを自動選択・置換しない |
| `loadPattern()` | 候補の追加取得。拒否したページは取得済みにしない |
| `loadPattern(true)` | 取得済み全参照の再検証。版変更後は候補を先頭から再開し重複を除く |
| `togglePatternRoute(key)`／既存close | 完全経路を開閉。ノードを閉じる場合はそのノードを含む全経路を閉じる |
| `cancelRelation()` | 条件切替を取消。Abortとgeneration／request照合で遅着応答を無視 |

自由探索へはadjacentを明示適用するか、既存の「広く見る」で切り替える。patternの通常expandは近傍探索へfallbackしない。409では旧表示を失効状態として保持し、追加取得を止める。中止後の版確認失敗・失効中の再検証失敗でもloadingを残さない。

既存Canvasはnodes／claimsをそのまま描画する。patternには近傍のexpanded印がないため、版確認済みpatternも配置開始可能とする最小変更を加えた。既存の配置関数・色・デザインを維持する。

## neighborsと旧状態の互換

GET neighborsへ任意の `polarity=affirmed|all-records` を追加。省略時の旧処理・応答・v5等のcursorは不変。肯定限定はClaimのLIMIT前に評価する。明示時だけ共通adjacent schemaを使い、全predicate集合・null／[]を保ち、不適合な限定を拒否する。応答relationも照合する。

新v6 cursorはoperation・center・全共通条件・dataset・revision・最終Claimを束縛。旧cursorはall-recordsかつ従来条件の意味が一致する場合だけ再利用できる。affirmedへの流用やv6の肯否変更は400、公開版変更は409。

保存形式・URL・collectionの版は変更していない。新条件を旧Workspace v1に書く操作だけを明示拒否し、古い無条件探索へ保存してしまうのを防ぐ。直前探索のメモリsnapshotは経路を保持し、通信状態を解除する。STEP 3bではView／Workspace／URLの新形式と全保存入口の対応、編集UI・表示中モードの案内を完成させるまで、新内部入口を一般UIに接続しない。

## 重点検証・引継ぎ

- 新規の状態・client・HTTP／cursor・Canvasテスト22件を含む、関連単体300件を分割実行して成功。旧Graph 104件、旧client API／HTTP／公開KG／STEP 2、旧経路、View／Workspace／URLを確認。無関係な収集・会員等の全件反復はしていない。
- `npm run discovery:graph:integration` は既存STEP 2の隔離harnessをモード指定で再利用する。7695の使い捨てNeo4jのみを書き換え、終了後削除。新6シナリオが成功。31経路の全頁、指定証拠の候補外保持、1,001件目の経路、復元全体の拒否、肯否のLIMIT前評価、旧cursor・公開revisionを確認した。
- 隔離fixtureの31経路は初回4,853ms／準備後86ms。高次数1,001件目の取得＋直接restoreは合計1,472ms。DB10秒／全体15秒を維持し、大規模な性能再調査・負荷試験は行っていない。
- Canvasは実コンポーネント＋headless Cytoscapeで配置と経路開閉を確認。広範囲の日英・スマホE2Eや導線評価は3b／4へ残す。

STEP 3bではこのAPI・実行状態を使い、編集／保存のdraft・取消・復元を実装する。requiredRouteと候補境界の分離、closed意図、原Claimの再検証、上限拒否時のcursor保持を引き継ぐ。隣接・patternの意味を混ぜた保存や、候補を全経路数とする表示は禁止。STEP 4のカタログ・対象検索の接続も未着手。

### 3200／betaの確認

型検査込みのpublic build・変更ファイルのESLintは成功。Webだけを更新し、build IDは `9K6FuonDUFw2QieCx5kWL`。公開revisionは前後とも `82b01515-594c-48ca-b4b6-515eefac83ca`。3200／betaでSTEP 2のPLUTO検索→指定証拠付きpage→全取得参照のrestore→同版のClaim詳細、旧paths GET・旧neighbors／affirmedを確認した。

新pageは10候補・10 Entity・12 Claim、全参照のrestoreも10経路。各経路の完全性・方向・全段肯定とSource数を検査し、指定証拠2 ClaimのCitationを既存詳細APIで照合した。旧paths GETは従来どおり10経路、neighborsの既定応答には新relationフィールドを追加していない。3200で既存の日／PCのプリセット→根拠→Graph→戻る・条件変更の代表E2E一件が成功（約11秒）。新しいpattern状態の一般UI導線は未接続のまま。

今回のHTTP最初／準備後の取得は3200で1,161ms／49ms、betaで339ms／302ms。STEP 2検索に続く取得であり、DB再起動後のcold保証ではない。高次数の計算量は次数に依存し、今回の1,001件fixtureを超える容量・同時負荷は未評価。正式VPSへの反映は行っていない。

### 作業時間の概算

| 工程 | 所要時間と主な内容 |
| --- | --- |
| 必要な確認 | 約5分。既存契約・変更対象・共通ロックの確認。完了済み調査の再実施なし |
| 実装・重点テスト作成 | 約20分。API／実行状態／Canvas配置、非同期・版・上限の整合性 |
| テスト実行・再試行 | 約3分。単一worker・隔離DB一回。誤って二段Claimを含めた一段モックを修正して該当試験だけ再実行。制限時間や期待値は緩和していない |
| build・型・lint | 約2分。最初のbuildはCanvasテストのmodule型不備で停止。型を修正し再build。API／クエリの時間切れや環境過負荷による停止ではない |
| 環境反映・実データ確認 | 約1分。3200再起動、beta API、既存UIの代表操作 |
| 差分レビュー・記録 | 約3分。引継ぎと互換境界の記録 |

一部の軽い記録作業は待ち時間と重複する概算。Docker・単体テスト・buildの重い同時実行を避け、今回は前工程のような長い環境待ちは観測していない。全体E2E・保存形式移行の総合試験は3b／4に残す。編集UIからのview取得・保存／URLとUndoの総合接続も次工程で行う。

## 後続工程

[STEP 3b Graph編集・保存・復元](DISCOVERY_PATTERN_GRAPH_PERSISTENCE.md)で編集UIと新保存形式を接続した。上記の「未着手」「一般UI未接続」はSTEP 3a時点の境界。現在の互換性と反映状態は後続記録を参照。Discovery接続はSTEP 4に残る。

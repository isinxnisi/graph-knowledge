# Discovery共通関係条件：STEP 3b Graph編集・保存・復元

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

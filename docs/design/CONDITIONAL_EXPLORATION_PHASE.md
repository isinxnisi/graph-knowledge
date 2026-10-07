# 既存predicateによる最小の条件付き探索

2026-10-03採用、2026-10-08に条件変更直前への復帰を追加。現行の採用契約。taxonomy・プリセット・時間条件・複数起点は追加しない。

## 条件変更UX

既存predicate（現在5種）を選び、「適用」で確定する。編集中はGraphを変えない。全件選択は無条件、空集合は明示的な「関係を表示しない」。未知predicateは拒否する。初期値は全関係。

適用時は同一起点の新しい探索へ切り替え、旧通信をabortし、新しい探索の受理ページ・cursor・キャッシュ・開閉意図をリセットする。変更直前の探索は一件だけ復帰用に保持する。選択は起点へ戻し、Claim / Relation詳細を解除する。条件editorで古い条件を再指定した場合は再取得する。「直前の探索へ戻る」の明示操作では、変更前の条件・受理範囲・枝を復元する。同じ実効条件の適用は何もしない。起点を検索から変更しても選んだ条件は維持する。

同一起点での条件変更は共通Nodeの以前の座標とpan/zoomを可能な限り維持する。初回配置を毎回やり直さず、新しいNodeのみ配置する。起点変更は従来どおりGraphをリセットする。条件変更とクリック待機の取消は同じ探索世代で制御する。

条件内の空結果は「この条件に一致する関係はありません」。無条件で受理済み空ページの場合のみ「孤立Entity」。詳細は全公開Claim比較を維持し、条件外とGraph未表示を区別する。predicateだけの条件なので同一RelationのClaimは同じ条件判定になるが、未取得ページのClaimは残る。

## API契約

以下はPredicate条件の基礎契約。後続の[三relation facet](RELATION_FACET_CONTRACTS.md)、[二用途typed限定](TYPED_QUALIFICATION_CONTRACTS.md)、[Event参加](EVENT_PARTICIPATION_CONTRACTS.md)の条件・cursor拡張も併せて適用する。

GET /api/entities/{id}/neighbors に任意の predicates を追加する。CSVの安定predicate ID集合。省略は全関係、空文字は空集合。順序・重複を正規化し、全predicateの指定は省略と同じ意味。パラメータ重複・未知ID・不正なCSV要素は400。対応外のqueryは400として黙って無視しない。

条件はpublished・両方向一段階のClaimにLIMIT前に適用する。affirmed / denied双方、Claim ID順、centerを含むnodes、重複排除、limit既定20／最大50は維持。返却型は変更しない。

無条件は従来のUUID cursorを維持する。部分集合／空集合のafterは、版・起点ID・正規化条件キー・最終Claim UUIDを持つ不透明なcursor。別条件・別起点・未知版・破損・UUID直接指定は400。条件付きcursorを無条件へ渡しても400。cursorは認可や改ざん防止、DBスナップショットを保証しない。limitの変更は可能。

## stateと表示

現在の探索には一つの有効な条件スコープのみを使う。別に直前一件の復帰用snapshotを保持する。GraphStateに正規化条件・条件キーを置き、そのスコープ内でEntityごとの展開を管理する。実効識別はスコープ＋Entity ID。多条件キャッシュを先行実装しない。ページ受理と表示導出でもpredicateを確認する。要求番号・世代・abortを併用し旧条件の結果を拒否する。

開閉・休止復元は同じ条件の受理済み範囲で従来どおり。上限・cursorの原子的な受理契約を維持する。Graph／一覧は同じ条件内Claimを参照しRelation集約はその後。localeで解決する関係選択文字列を別リソースに置く。今回実装は日本語のみ。


実装・検証の記録は [Phase 03](../archive/phase-03-conditional-exploration/IMPLEMENTATION_CONDITIONAL_EXPLORATION.md) を参照する。

## 条件を試した後の復帰（2026-10-08採用）

条件を絞って空結果や取得失敗になった際、従来は展開済みの探索へ戻れず、枝を辿り直す必要があった。起点切替の既存snapshotを条件適用にも利用し、試行前の探索へ戻れるようにする。

- 実効条件が変わる適用の直前に、確定条件（Predicate・制作Role・組織立場・Event立場）、受理Graph/cache、cursor、開閉意図、選択、座標・pan/zoomを記録する。起点未指定では復帰を作らない。
- 履歴は起点切替と共通の一件。次の条件変更／起点切替で置換し、同じ実効条件の再適用・draftの取消では変更しない。連続した取り消しややり直しは提供しない。
- 「直前の探索へ戻る」は取得失敗中・空結果でも使用できる。新世代で現在の通信を取り消し、旧応答を排除してsnapshotを消費する。近傍を自動再取得せず、受理済みcursorから明示的に続きを取得できる。詳細の読取通信は通常どおり行う。
- 保存時に進行中だった取得は復帰後に中断として表示し、手動で再試行する。休止枝・明示閉鎖・未表示キャッシュも既存の復元契約を使う。
- 保存上限、座標が未取得の場合のfallback、同じdatasetの画面内だけの寿命、検索候補／開始例による新規探索での失効は[ARCHITECTUREの直前一件の復帰](../ARCHITECTURE.md#直前一件の復帰)と共通。永続保存・共有・Capsuleの仕様は追加しない。

API・DB・dataset・知識モデルは変更しない。現行の上限内にあるメモリ上のsnapshotだけを再利用するため、データ移行は不要で、この接続を外せば以前の条件適用へ戻せる。

検証は`tests/ui-state.test.tsx`で休止枝・cursor・三限定・選択・同条件の無操作・履歴置換・通信中断・遅延応答・取得失敗を確認する。`tests/e2e/condition-restore.spec.ts`では390px／1440pxのAPI固定応答を使い、実Canvasの座標・pan/zoom・選択・条件の復帰と、復帰時の近傍通信なし／元cursorによる追加取得を確認する。

検証結果：`npm test` 263件、`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check`が成功。状態テスト91件の再実行も成功。Playwrightは本番ビルドで新規2件、既存の狭い画面4件・Graph移動1件が成功した。初回の新規2件は作品名が作者の説明文にも一致するテスト指定で停止し、名前の先頭へ指定を絞った再実行で成功。DBはAPI固定応答で代替しており、実機タッチの検証は含まない。

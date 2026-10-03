# 既存predicateによる最小の条件付き探索

2026-10-03。今回の採用契約。taxonomy・プリセット・時間条件・複数起点は追加しない。

## 条件変更UX

既存4 predicateをチェックボックスで選び、「適用」で確定する。編集中はGraphを変えない。全件選択は無条件、空集合は明示的な「関係を表示しない」。未知predicateは拒否する。初期値は全関係。

適用時は同一起点の新しい探索へ切り替え、旧通信をabortし、受理ページ・cursor・キャッシュ・開閉意図を破棄する。選択は起点へ戻し、Claim / Relation詳細を解除する。古い条件へ戻しても旧枝を復元しない。同じ実効条件の適用は何もしない。起点を検索から変更しても選んだ条件は維持する。

同一起点での条件変更は共通Nodeの以前の座標とpan/zoomを可能な限り維持する。初回配置を毎回やり直さず、新しいNodeのみ配置する。起点変更は従来どおりGraphをリセットする。条件変更とクリック待機の取消は同じ探索世代で制御する。

条件内の空結果は「この条件に一致する関係はありません」。無条件で受理済み空ページの場合のみ「孤立Entity」。詳細は全公開Claim比較を維持し、条件外とGraph未表示を区別する。predicateだけの条件なので同一RelationのClaimは同じ条件判定になるが、未取得ページのClaimは残る。

## API契約

GET /api/entities/{id}/neighbors に任意の predicates を追加する。CSVの安定predicate ID集合。省略は全関係、空文字は空集合。順序・重複を正規化し、全4種は省略と同じ意味。パラメータ重複・未知ID・不正なCSV要素は400。対応外のqueryは400として黙って無視しない。

条件はpublished・両方向一段階のClaimにLIMIT前に適用する。affirmed / denied双方、Claim ID順、centerを含むnodes、重複排除、limit既定20／最大50は維持。返却型は変更しない。

無条件は従来のUUID cursorを維持する。部分集合／空集合のafterは、版・起点ID・正規化条件キー・最終Claim UUIDを持つ不透明なcursor。別条件・別起点・未知版・破損・UUID直接指定は400。条件付きcursorを無条件へ渡しても400。cursorは認可や改ざん防止、DBスナップショットを保証しない。limitの変更は可能。

## stateと表示

一つの有効な条件スコープのみ保持する。GraphStateに正規化条件・条件キーを置き、そのスコープ内でEntityごとの展開を管理する。実効識別はスコープ＋Entity ID。多条件キャッシュを先行実装しない。ページ受理と表示導出でもpredicateを確認する。要求番号・世代・abortを併用し旧条件の結果を拒否する。

開閉・休止復元は同じ条件の受理済み範囲で従来どおり。上限・cursorの原子的な受理契約を維持する。Graph／一覧は同じ条件内Claimを参照しRelation集約はその後。localeで解決する関係選択文字列を別リソースに置く。今回実装は日本語のみ。


実装・検証の記録は [Phase 03](../archive/phase-03-conditional-exploration/IMPLEMENTATION_CONDITIONAL_EXPLORATION.md) を参照する。

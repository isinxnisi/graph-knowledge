# Phase 13：組織・会議・評価の第2回モデル比較

2026-10-05。資料確認、版付き研究台帳、5方式比較まで実施。DB投入・seed・runtime schema・語彙catalog・API/UI変更なし。

## 成果物

- [現役の第2回比較レビュー](../../design/RELATION_MODEL_SECOND_COMPARISON_REVIEW.md)：9研究記録、反例、A/B/Fとの比較、十の問い、次Phaseの限定案。
- [研究台帳v2](../../research/phase-13-relation-model/v2/README.md)：親版を保存し、Phase 12新規7件の狭い事実受入と構造化未承認を分離。D/E/C全9記録は人間受入待ち。
- 全17記録／85比較票／16 Source／23 Citation参照。約37件分の関係材料＋改称対照1件。合併・理論対象・未確定影響源を投入可能な独立二項Claimへ水増ししていない。

## 資料・判断

大学のdepartment一覧とNBI改称史、Cour des comptesのCurie沿革、Solvay主催者索引と1928年議事録／2018年年報、Einstein本人自伝英訳複製、Leiden書簡抜粋、Nortonの本人文章再引用を確認した。原書簡・自伝p.53の原版未照合、Curie法的継続性未確定、科学C09はpendingを維持。

招待された欠席者は参加Roleにできない。改称は二Entity間の前身にしない。理論批判は提唱者人格批判ではない。共通typed処理は実対象の同定・多項性・同義性を解決しない。次Phaseは組織立場と既存制作限定の二用途で必要な処理を共有する最小案の契約決定を推奨し、今回実装していない。

## 検証

[台帳READMEの再検証](../../research/phase-13-relation-model/v2/README.md#再検証)を実行し成功。必須11比較欄・参照・件数・受入状態分離・ledger hash・親版3ファイル／既存34JSONのhashを照合した。

- `npm test`：7 test files、158 testsすべて成功。
- `npm run vocabulary:check -- --base-ref 49eafb8`：4 predicate／4 Role、error 0。同一端点組ASSISTANT_OF／INFLUENCED_BYの既存warning 1件。
- 親版のSource・既存比較票・既存材料の内容一致を検証。凍結v1そのものは変更なし。
- 新しい文書のローカルリンク、短い引用断片の上限、`git diff --check`も成功。

成果物は文書と研究用JSONのみ。DB統合／Playwright／buildはアプリ変更がないためこのPhaseの確認対象外で、実行したとは報告しない。Source本文は/tmpのみ、依存・packageは変更なし。

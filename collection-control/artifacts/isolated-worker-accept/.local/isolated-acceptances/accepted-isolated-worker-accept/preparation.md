# 正式受入と公開release準備

状態: release-prepared-not-applied。公開applyは未実施。

判断ID: `isolated-worker-accept`。実記録日時: 2026-10-18T11:26:31.944600+00:00。

| 対象 | 今回の承認対象 | 現公開baseからの統合追加 |
| --- | ---: | ---: |
| entities | 2 | 15 |
| claims | 1 | 10 |
| sources | 1 | 8 |
| citations | 1 | 10 |

release: `/tmp/plunode-worker-isolated-tdae5qji/runtime/.local/isolated-releases/isolated-worker-release`。validate成功、最新の無書込plan成功、既存更新0。

未受入対象・既存再利用・保留UUID・plan全件はpreparation.json。保留や未選択レコードを自動受入しない。

## 保留

- 大友克洋 → 童夢／work-to-publication-mapping-needs-human-review
- 工藤かずや → パイナップルARMY／endpoint-identity-held
- 浦沢直樹 → パイナップルARMY／endpoint-identity-held
- パイナップルARMY／existing-identity-needs-explicit-uuid-mapping

原責任表示の取得時保留はpreparation.jsonのinheritedHoldsに原語・理由を保持する。未選択の受入推奨は保留とは別に未判断のまま残す。

## 代表経路

正式受入済み未適用の接続を含む。公開画面での実探索確認ではない。


接続ごとのscope・Citation・Sourceはpreparation.jsonに保持。新しい直接関係は推測生成しない。公開前には別のapply承認と適用先での最新検証が必要。

# 正式受入と公開release準備

状態: release-prepared-not-applied。公開applyは未実施。

判断ID: `film-saved-ab-20261028`。実記録日時: 2026-10-27T20:38:59.528925+00:00。

| 対象 | 今回の承認対象 | 現公開baseからの統合追加 |
| --- | ---: | ---: |
| entities | 29 | 29 |
| claims | 34 | 34 |
| sources | 5 | 5 |
| citations | 34 | 34 |

release: `/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020/runtime/datasets/public-kg/releases/film-saved-ab-20261028`。validate成功、検証済み本番backupに対するoffline plan成功（最新VPS実planは未実施）、既存更新0。

未受入対象・既存再利用・保留UUID・plan全件はpreparation.json。保留や未選択レコードを自動受入しない。

## 保留


原責任表示の取得時保留はpreparation.jsonのinheritedHoldsに原語・理由を保持する。未選択の受入推奨は保留とは別に未判断のまま残す。

## 代表経路

正式受入済み未適用の接続を含む。公開画面での実探索確認ではない。

- レオナルド・ディカプリオ → インセプション [ACTING; 01e2a86b-6801-472b-8e32-a91cc0925dfc] ; マイケル・ケイン → インセプション [ACTING; 382e652d-e1ff-4b2a-8766-cbc9d0c95233] ; マイケル・ケイン → インターステラー [ACTING; 1baf9c26-c4bb-4d09-9caa-16114a81b8af]／formally-accepted-not-applied
- 渡辺謙 → インセプション [ACTING; 0a7e8587-895a-46b7-9b20-9363f4d444a6] ; マイケル・ケイン → インセプション [ACTING; 382e652d-e1ff-4b2a-8766-cbc9d0c95233] ; マイケル・ケイン → インターステラー [ACTING; 1baf9c26-c4bb-4d09-9caa-16114a81b8af]／formally-accepted-not-applied
- ジョン・スペイツ → デューン [SCRIPT_WRITING; 11db956d-70a9-43cf-805b-9ffa576da501] ; ドゥニ・ヴィルヌーヴ → デューン [DIRECTING; 94596246-2d89-4026-8fe6-8e996dd61b63] ; ドゥニ・ヴィルヌーヴ → メッセージ [DIRECTING; 2721d599-98fa-48bd-836d-cff2aa4f023b]／formally-accepted-not-applied
- マイケル・ケイン → インターステラー [ACTING; 1baf9c26-c4bb-4d09-9caa-16114a81b8af] ; クリストファー・ノーラン → インターステラー [PRODUCING; 204905b0-1f64-4e98-beb9-974b6031c7b0] ; クリストファー・ノーラン → インセプション [SCRIPT_WRITING; 8974c334-d6c9-4a20-a4ee-35d3ee322c9a]／formally-accepted-not-applied
- クリストファー・ノーラン → インターステラー [PRODUCING; 204905b0-1f64-4e98-beb9-974b6031c7b0] ; マイケル・ケイン → インターステラー [ACTING; 1baf9c26-c4bb-4d09-9caa-16114a81b8af] ; マイケル・ケイン → インセプション [ACTING; 382e652d-e1ff-4b2a-8766-cbc9d0c95233]／formally-accepted-not-applied
- マシュー・マコノヒー → インターステラー [ACTING; 2560c363-e2f7-4481-84cc-025833259a0d] ; マイケル・ケイン → インターステラー [ACTING; 1baf9c26-c4bb-4d09-9caa-16114a81b8af] ; マイケル・ケイン → インセプション [ACTING; 382e652d-e1ff-4b2a-8766-cbc9d0c95233]／formally-accepted-not-applied

接続ごとのscope・Citation・Sourceはpreparation.jsonに保持。新しい直接関係は推測生成しない。公開前には別のapply承認と適用先での最新検証が必要。

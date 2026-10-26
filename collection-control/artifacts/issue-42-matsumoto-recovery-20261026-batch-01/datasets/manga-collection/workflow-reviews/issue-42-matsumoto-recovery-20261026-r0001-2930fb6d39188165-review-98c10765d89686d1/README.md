# 収集候補の一括受入レビュー

正式受入・公開applyではない。重要な同一性・意味判断は人間が確認する。

状態はcontext.jsonで指定した公開snapshot・受入済み追加集合に対する照合結果。過去snapshotによる再現を現在の受入／公開状態に読み替えない。

Job: `issue-42-matsumoto-recovery-20261026-r0001-2930fb6d39188165`。公開照合: `20261014-credits-001` / `82b01515-594c-48ca-b4b6-515eefac83ca`（live-readonly-backup）。

新規判断対象: {"entities": 4, "claims": 3, "sources": 3, "citations": 3}。Claim保留 0、Entity保留 0。

原語の未対応表示と取得時の保留はreview.jsonのinheritedHoldsを参照。Identity-only候補は通常グループに自動混入しない。

candidate＝収集候補、formally-accepted-not-applied＝正式受入済み未適用、published-in-public-snapshot＝指定revisionの公開収録確認。保留は今回の入力照合についてであり、既存の正式受入・公開状態を取り消すものではない。

| 人物 → 作品 | Role／ISBN scope | Claim UUID／状態 | 根拠Citation UUID／保留理由 |
| --- | --- | --- | --- |
| 松本大洋 → ピンポン | AUTHORSHIP／9784091847362 第1巻（NDL巻次 1） | `64aaee6b-13f7-46ea-abdf-87702307c9dd`／candidate（既存状態: None; 対応UUID: None） | 松本大洋 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002504019 ; 383d45a0-87e9-42c4-9f03-b9f5e09922a4／ |
| 松本大洋 → Sunny | AUTHORSHIP／9784091885579 第1集（NDL巻次原語） | `683a9810-956c-400f-9b52-75157028dd25`／candidate（既存状態: None; 対応UUID: None） | 松本大洋 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000011265531 ; 5c22c627-73cd-407d-9c21-6912a24ce8b4／ |
| 松本大洋 → 鉄コン筋クリート | AUTHORSHIP／9784091847317 第1巻（NDL巻次 1） | `93af343c-0b9b-44d7-8ec3-162f6aefaefd`／candidate（既存状態: None; 対応UUID: None） | 松本大洋 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002304847 ; 1b95df52-cb80-46da-8635-cdb9e899f135／ |

| Entity | UUID／状態 | 同定・保留理由 |
| --- | --- | --- |
| 鉄コン筋クリート | `4e381195-6f4c-4cc0-baae-1387b089a408`／candidate | Q111988774／ |
| ピンポン | `a442f5b0-ff10-43d7-9d32-b20070f2c524`／candidate | Q837883／ |
| 松本大洋 | `add1b76d-07c6-46bd-999c-096d5593e670`／candidate | Q1504165／ |
| Sunny | `f7a0ef9b-f8af-45f6-9f5d-e44fc0dab4f6`／candidate | Q18154676／ |

## 代表的な探索経路

各接続のRole・scope・状態・Citation／Sourceはexploration-paths.jsonに固定。人物間の直接関係を推測生成しない。公開APIでの実探索確認ではない。最大6経路・各段の候補20件の代表例であり、網羅性を保証しない。

- 松本大洋 → ピンポン [AUTHORSHIP; 64aaee6b-13f7-46ea-abdf-87702307c9dd] ; 松本大洋 → Sunny [AUTHORSHIP; 683a9810-956c-400f-9b52-75157028dd25]／collection-candidate

判断対象UUID・scope・参照hashはdecision-request.json。元ジョブ／既存公開／既受入データは変更していない。タスク2の受入記録・release生成・applyは実行しない。

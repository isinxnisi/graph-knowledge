# 収集候補の一括受入レビュー

正式受入・公開applyではない。重要な同一性・意味判断は人間が確認する。

状態はcontext.jsonで指定した公開snapshot・受入済み追加集合に対する照合結果。過去snapshotによる再現を現在の受入／公開状態に読み替えない。

Job: `issue-59-dot-kubo-two-20261028-r0001-00347e7b023773d6`。公開照合: `20261014-credits-001` / `82b01515-594c-48ca-b4b6-515eefac83ca`（live-readonly-backup）。

新規判断対象: {"entities": 3, "claims": 2, "sources": 2, "citations": 2}。Claim保留 0、Entity保留 0。

原語の未対応表示と取得時の保留はreview.jsonのinheritedHoldsを参照。Identity-only候補は通常グループに自動混入しない。

candidate＝収集候補、formally-accepted-not-applied＝正式受入済み未適用、published-in-public-snapshot＝指定revisionの公開収録確認。保留は今回の入力照合についてであり、既存の正式受入・公開状態を取り消すものではない。

| 人物 → 作品 | Role／ISBN scope | Claim UUID／状態 | 根拠Citation UUID／保留理由 |
| --- | --- | --- | --- |
| 久保帯人 → BLEACH | AUTHORSHIP／9784081135974 第1巻（NDL巻次 1 (死神代行篇 1 (邂逅))） | `5b908144-891a-4f41-b1a1-7cc53cf9dc20`／candidate（既存状態: None; 対応UUID: None） | 久保帯人 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I029136607 ; 592176e6-0ed2-41a1-a1c8-086f0ad33adc／ |
| 久保帯人 → BURN THE WITCH | AUTHORSHIP／9784088824284 第1巻（NDL巻次 1） | `fd5be30b-cf2d-4102-ab7d-476a0cea15c3`／candidate（既存状態: None; 対応UUID: None） | 久保帯人 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I030650368 ; 301f91f8-f898-4585-a126-a9b0d0dee5a9／ |

| Entity | UUID／状態 | 同定・保留理由 |
| --- | --- | --- |
| BLEACH | `398992d4-e691-4b85-a3c9-d7aac12a7656`／candidate | Q12685666／ |
| 久保帯人 | `46f3495e-2aa7-4055-bade-adaaac4684b8`／candidate | Q295073／ |
| BURN THE WITCH | `6d6f4a25-7bac-4d77-961b-b38d332d8501`／candidate | Q55237911／ |

## 代表的な探索経路

各接続のRole・scope・状態・Citation／Sourceはexploration-paths.jsonに固定。人物間の直接関係を推測生成しない。公開APIでの実探索確認ではない。最大6経路・各段の候補20件の代表例であり、網羅性を保証しない。

- 久保帯人 → BLEACH [AUTHORSHIP; 5b908144-891a-4f41-b1a1-7cc53cf9dc20] ; 久保帯人 → BURN THE WITCH [AUTHORSHIP; fd5be30b-cf2d-4102-ab7d-476a0cea15c3]／collection-candidate

判断対象UUID・scope・参照hashはdecision-request.json。元ジョブ／既存公開／既受入データは変更していない。タスク2の受入記録・release生成・applyは実行しない。

# 収集候補の一括受入レビュー

正式受入・公開applyではない。重要な同一性・意味判断は人間が確認する。

状態はcontext.jsonで指定した公開snapshot・受入済み追加集合に対する照合結果。過去snapshotによる再現を現在の受入／公開状態に読み替えない。

Job: `issue-62-dot-akutami-jujutsu-20261028-r0001-9316236b1f6d5eb9`。公開照合: `20261014-credits-001` / `82b01515-594c-48ca-b4b6-515eefac83ca`（live-readonly-backup）。

新規判断対象: {"entities": 2, "claims": 1, "sources": 1, "citations": 1}。Claim保留 0、Entity保留 0。

原語の未対応表示と取得時の保留はreview.jsonのinheritedHoldsを参照。Identity-only候補は通常グループに自動混入しない。

candidate＝収集候補、formally-accepted-not-applied＝正式受入済み未適用、published-in-public-snapshot＝指定revisionの公開収録確認。保留は今回の入力照合についてであり、既存の正式受入・公開状態を取り消すものではない。

| 人物 → 作品 | Role／ISBN scope | Claim UUID／状態 | 根拠Citation UUID／保留理由 |
| --- | --- | --- | --- |
| 芥見下々 → 呪術廻戦 | AUTHORSHIP／9784088815169 第1巻（NDL巻次 1） | `ac52107c-1fcb-4fbc-ac4e-6b7928c1691f`／candidate（既存状態: None; 対応UUID: None） | 芥見下々 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I029060849 ; 3556b189-8631-45e9-aa25-0ed8b8ea33cc／ |

| Entity | UUID／状態 | 同定・保留理由 |
| --- | --- | --- |
| 芥見下々 | `532b9547-65c6-463f-a331-f4bd80044fd9`／candidate | Q60231010／ |
| 呪術廻戦 | `77b2696f-4ba7-469a-b591-9e3ce5e1fedb`／candidate | Q55522899／ |

## 代表的な探索経路

各接続のRole・scope・状態・Citation／Sourceはexploration-paths.jsonに固定。人物間の直接関係を推測生成しない。公開APIでの実探索確認ではない。最大6経路・各段の候補20件の代表例であり、網羅性を保証しない。


判断対象UUID・scope・参照hashはdecision-request.json。元ジョブ／既存公開／既受入データは変更していない。タスク2の受入記録・release生成・applyは実行しない。

# 収集候補の一括受入レビュー

正式受入・公開applyではない。重要な同一性・意味判断は人間が確認する。

状態はcontext.jsonで指定した公開snapshot・受入済み追加集合に対する照合結果。過去snapshotによる再現を現在の受入／公開状態に読み替えない。

Job: `issue-58-dot-takeuchi-two-20261028-r0001-7631e34f1dc1a01a`。公開照合: `20261014-credits-001` / `82b01515-594c-48ca-b4b6-515eefac83ca`（live-readonly-backup）。

新規判断対象: {"entities": 2, "claims": 1, "sources": 1, "citations": 1}。Claim保留 0、Entity保留 0。

原語の未対応表示と取得時の保留はreview.jsonのinheritedHoldsを参照。Identity-only候補は通常グループに自動混入しない。

candidate＝収集候補、formally-accepted-not-applied＝正式受入済み未適用、published-in-public-snapshot＝指定revisionの公開収録確認。保留は今回の入力照合についてであり、既存の正式受入・公開状態を取り消すものではない。

| 人物 → 作品 | Role／ISBN scope | Claim UUID／状態 | 根拠Citation UUID／保留理由 |
| --- | --- | --- | --- |
| 武内直子 → コードネームはセーラーV | AUTHORSHIP／9784065140857 第1巻（NDL巻次 1） | `6505aa5e-4745-455c-b2f5-7d8c6cb17428`／candidate（既存状態: None; 対応UUID: None） | 武内直子 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I029519251 ; 452caaff-f4c1-4d69-bc81-57c60c1e70cf／ |

| Entity | UUID／状態 | 同定・保留理由 |
| --- | --- | --- |
| 武内直子 | `64f51852-27b2-41c0-88dc-f9d8c895454d`／candidate | Q229724／ |
| コードネームはセーラーV | `6af9b8cc-6cb0-468e-a77b-bb7066153c9b`／candidate | Q868170／ |

## 代表的な探索経路

各接続のRole・scope・状態・Citation／Sourceはexploration-paths.jsonに固定。人物間の直接関係を推測生成しない。公開APIでの実探索確認ではない。最大6経路・各段の候補20件の代表例であり、網羅性を保証しない。


判断対象UUID・scope・参照hashはdecision-request.json。元ジョブ／既存公開／既受入データは変更していない。タスク2の受入記録・release生成・applyは実行しない。

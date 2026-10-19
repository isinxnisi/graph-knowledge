# 収集候補の一括受入レビュー

正式受入・公開applyではない。重要な同一性・意味判断は人間が確認する。

状態はcontext.jsonで指定した公開snapshot・受入済み追加集合に対する照合結果。過去snapshotによる再現を現在の受入／公開状態に読み替えない。

Job: `issue-25-utc-recovery-r0008-9f792bd2246a1595`。公開照合: `20261014-credits-001` / `82b01515-594c-48ca-b4b6-515eefac83ca`（live-readonly-backup）。

新規判断対象: {"entities": 3, "claims": 2, "sources": 2, "citations": 2}。Claim保留 0、Entity保留 0。

原語の未対応表示と取得時の保留はreview.jsonのinheritedHoldsを参照。Identity-only候補は通常グループに自動混入しない。

candidate＝収集候補、formally-accepted-not-applied＝正式受入済み未適用、published-in-public-snapshot＝指定revisionの公開収録確認。保留は今回の入力照合についてであり、既存の正式受入・公開状態を取り消すものではない。

| 人物 → 作品 | Role／ISBN scope | Claim UUID／状態 | 根拠Citation UUID／保留理由 |
| --- | --- | --- | --- |
| あだち充 → MIX | AUTHORSHIP／9784091238672 第1巻（NDL巻次 1） | `c72262df-ce7b-4514-9341-55d242f94bca`／candidate（既存状態: None; 対応UUID: None） | あだち充 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I023983988 ; 1cd43ec8-2630-4fbc-8267-1ce03a9ee04c／ |
| あだち充 → H2 | AUTHORSHIP／9784091231512 第1巻（NDL巻次 1） | `f1260c3f-2637-416f-b407-2052a7c36717`／candidate（既存状態: None; 対応UUID: None） | あだち充 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002238601 ; 07906647-1603-470d-a950-a663290bbd75／ |

| Entity | UUID／状態 | 同定・保留理由 |
| --- | --- | --- |
| あだち充 | `1abd838a-b22d-45a4-913f-0ef09205e1e8`／candidate | Q351742／ |
| MIX | `48ca311c-c403-4a24-a1e3-cb6392764397`／candidate | Q11231713／ |
| H2 | `bb47fc9c-87b1-4df5-a7d6-ecf175d93eb0`／candidate | Q652892／ |

## 代表的な探索経路

各接続のRole・scope・状態・Citation／Sourceはexploration-paths.jsonに固定。人物間の直接関係を推測生成しない。公開APIでの実探索確認ではない。最大6経路・各段の候補20件の代表例であり、網羅性を保証しない。

- あだち充 → MIX [AUTHORSHIP; c72262df-ce7b-4514-9341-55d242f94bca] ; あだち充 → H2 [AUTHORSHIP; f1260c3f-2637-416f-b407-2052a7c36717]／collection-candidate

判断対象UUID・scope・参照hashはdecision-request.json。元ジョブ／既存公開／既受入データは変更していない。タスク2の受入記録・release生成・applyは実行しない。

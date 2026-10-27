# 収集候補の一括受入レビュー

正式受入・公開applyではない。重要な同一性・意味判断は人間が確認する。

状態はcontext.jsonで指定した公開snapshot・受入済み追加集合に対する照合結果。過去snapshotによる再現を現在の受入／公開状態に読み替えない。

Job: `issue-46-dot-aoyama-three-20261027-r0001-0d4c3c14acfa63a5`。公開照合: `20261014-credits-001` / `82b01515-594c-48ca-b4b6-515eefac83ca`（live-readonly-backup）。

新規判断対象: {"entities": 3, "claims": 2, "sources": 2, "citations": 2}。Claim保留 0、Entity保留 0。

原語の未対応表示と取得時の保留はreview.jsonのinheritedHoldsを参照。Identity-only候補は通常グループに自動混入しない。

candidate＝収集候補、formally-accepted-not-applied＝正式受入済み未適用、published-in-public-snapshot＝指定revisionの公開収録確認。保留は今回の入力照合についてであり、既存の正式受入・公開状態を取り消すものではない。

| 人物 → 作品 | Role／ISBN scope | Claim UUID／状態 | 根拠Citation UUID／保留理由 |
| --- | --- | --- | --- |
| 青山剛昌 → まじっく快斗 | AUTHORSHIP／9784091220813 第1巻（NDL巻次 1） | `6f399d03-39b1-4597-a6f7-5ea502d6f0de`／candidate（既存状態: None; 対応UUID: None） | 青山剛昌 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000001925410 ; 33e9cad2-025a-42a2-9af5-379eacdd9e24／ |
| 青山剛昌 → YAIBA | AUTHORSHIP／9784091222718 第1巻（NDL巻次 1） | `93e90c81-89b2-4415-aa66-47880b088ea9`／candidate（既存状態: None; 対応UUID: None） | 青山剛昌 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000001987533 ; 7477d6a0-9af0-4b01-be7d-27fe83d955ca／ |

| Entity | UUID／状態 | 同定・保留理由 |
| --- | --- | --- |
| YAIBA | `7f7081d8-364a-4b56-b3e1-ceea35edb5a2`／candidate | Q626947／ |
| まじっく快斗 | `a580b967-9c99-483e-94ef-fb5834e1f520`／candidate | Q113329／ |
| 青山剛昌 | `ced2e2f2-b82e-41b3-a3cb-c5a36214d6b5`／candidate | Q313945／ |

## 代表的な探索経路

各接続のRole・scope・状態・Citation／Sourceはexploration-paths.jsonに固定。人物間の直接関係を推測生成しない。公開APIでの実探索確認ではない。最大6経路・各段の候補20件の代表例であり、網羅性を保証しない。

- 青山剛昌 → まじっく快斗 [AUTHORSHIP; 6f399d03-39b1-4597-a6f7-5ea502d6f0de] ; 青山剛昌 → YAIBA [AUTHORSHIP; 93e90c81-89b2-4415-aa66-47880b088ea9]／collection-candidate

判断対象UUID・scope・参照hashはdecision-request.json。元ジョブ／既存公開／既受入データは変更していない。タスク2の受入記録・release生成・applyは実行しない。

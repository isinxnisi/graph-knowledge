# 収集候補の一括受入レビュー

正式受入・公開applyではない。重要な同一性・意味判断は人間が確認する。

状態はcontext.jsonで指定した公開snapshot・受入済み追加集合に対する照合結果。過去snapshotによる再現を現在の受入／公開状態に読み替えない。

Job: `issue-25-utc-recovery-r0007-0b3c13e86c5f069c`。公開照合: `20261014-credits-001` / `82b01515-594c-48ca-b4b6-515eefac83ca`（live-readonly-backup）。

新規判断対象: {"entities": 3, "claims": 2, "sources": 2, "citations": 2}。Claim保留 0、Entity保留 0。

原語の未対応表示と取得時の保留はreview.jsonのinheritedHoldsを参照。Identity-only候補は通常グループに自動混入しない。

candidate＝収集候補、formally-accepted-not-applied＝正式受入済み未適用、published-in-public-snapshot＝指定revisionの公開収録確認。保留は今回の入力照合についてであり、既存の正式受入・公開状態を取り消すものではない。

| 人物 → 作品 | Role／ISBN scope | Claim UUID／状態 | 根拠Citation UUID／保留理由 |
| --- | --- | --- | --- |
| 高屋奈月 → 翼を持つ者 | AUTHORSHIP／9784592128311 第1巻（NDL巻次 第1巻） | `2fbb4bf1-5180-456b-9681-e3ec75a54cd8`／candidate（既存状態: None; 対応UUID: None） | 高屋奈月 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002526551 ; 14dd2924-b263-4531-975a-7b9a52b23a3d／ |
| 高屋奈月 → フルーツバスケット | AUTHORSHIP／9784592171614 第1巻（NDL巻次 第1巻） | `87432807-ba90-400c-8a3f-e5dcfa847572`／candidate（既存状態: None; 対応UUID: None） | 高屋奈月 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002761106 ; 1912d6bf-b638-4e14-902b-9979bf64062a／ |

| Entity | UUID／状態 | 同定・保留理由 |
| --- | --- | --- |
| 翼を持つ者 | `451e8e8a-0d17-4dfd-99d8-14b57780e055`／candidate | Q2947180／ |
| フルーツバスケット | `7a7678a2-f7a8-4381-aaf0-ecddb866fca0`／candidate | Q216204／ |
| 高屋奈月 | `89958cbe-1822-4814-9861-fec01c94378a`／candidate | Q241885／ |

## 代表的な探索経路

各接続のRole・scope・状態・Citation／Sourceはexploration-paths.jsonに固定。人物間の直接関係を推測生成しない。公開APIでの実探索確認ではない。最大6経路・各段の候補20件の代表例であり、網羅性を保証しない。

- 高屋奈月 → 翼を持つ者 [AUTHORSHIP; 2fbb4bf1-5180-456b-9681-e3ec75a54cd8] ; 高屋奈月 → フルーツバスケット [AUTHORSHIP; 87432807-ba90-400c-8a3f-e5dcfa847572]／collection-candidate

判断対象UUID・scope・参照hashはdecision-request.json。元ジョブ／既存公開／既受入データは変更していない。タスク2の受入記録・release生成・applyは実行しない。

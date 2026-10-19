# 収集候補の一括受入レビュー

正式受入・公開applyではない。重要な同一性・意味判断は人間が確認する。

状態はcontext.jsonで指定した公開snapshot・受入済み追加集合に対する照合結果。過去snapshotによる再現を現在の受入／公開状態に読み替えない。

Job: `issue-25-utc-recovery-r0006-18bb8d898648582b`。公開照合: `20261014-credits-001` / `82b01515-594c-48ca-b4b6-515eefac83ca`（live-readonly-backup）。

新規判断対象: {"entities": 4, "claims": 3, "sources": 3, "citations": 3}。Claim保留 0、Entity保留 0。

原語の未対応表示と取得時の保留はreview.jsonのinheritedHoldsを参照。Identity-only候補は通常グループに自動混入しない。

candidate＝収集候補、formally-accepted-not-applied＝正式受入済み未適用、published-in-public-snapshot＝指定revisionの公開収録確認。保留は今回の入力照合についてであり、既存の正式受入・公開状態を取り消すものではない。

| 人物 → 作品 | Role／ISBN scope | Claim UUID／状態 | 根拠Citation UUID／保留理由 |
| --- | --- | --- | --- |
| 矢沢あい → 天使なんかじゃない | AUTHORSHIP／9784086187657 第1巻（NDL巻次 1） | `45a9d1b7-9f6f-4879-807a-ac4b175e4243`／candidate（既存状態: None; 対応UUID: None） | 矢沢あい 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000009594314 ; 0696f0a4-1721-4484-8d87-cc5b41089f7e／ |
| 矢沢あい → ご近所物語 | AUTHORSHIP／9784088538204 第1巻（NDL巻次 1） | `682fc119-9ac2-4061-b8a1-5d0de889f9ef`／candidate（既存状態: None; 対応UUID: None） | 矢沢あい 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002442460 ; 2bda879a-bb80-44c7-ac62-60d47248a8a2／ |
| 矢沢あい → NANA | AUTHORSHIP／9784088562094 第1巻（NDL巻次 1） | `bdbb1592-4e6a-47c7-80ca-b120f9780e97`／candidate（既存状態: None; 対応UUID: None） | 矢沢あい 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002890352 ; 37c5b39c-732d-4476-8ece-08a79e8c54de／ |

| Entity | UUID／状態 | 同定・保留理由 |
| --- | --- | --- |
| 天使なんかじゃない | `648a399e-70c0-4042-b969-e914a4410544`／candidate | Q1132540／ |
| 矢沢あい | `9888fc07-92c4-414b-b449-d33f7b9b07bc`／candidate | Q234425／ |
| NANA | `a546e8f9-0e9e-4e39-a591-21e3e1ffd9dc`／candidate | Q423658／ |
| ご近所物語 | `fe378e87-1945-4e1d-869e-c8ec88e998d4`／candidate | Q787081／ |

## 代表的な探索経路

各接続のRole・scope・状態・Citation／Sourceはexploration-paths.jsonに固定。人物間の直接関係を推測生成しない。公開APIでの実探索確認ではない。最大6経路・各段の候補20件の代表例であり、網羅性を保証しない。

- 矢沢あい → 天使なんかじゃない [AUTHORSHIP; 45a9d1b7-9f6f-4879-807a-ac4b175e4243] ; 矢沢あい → ご近所物語 [AUTHORSHIP; 682fc119-9ac2-4061-b8a1-5d0de889f9ef]／collection-candidate

判断対象UUID・scope・参照hashはdecision-request.json。元ジョブ／既存公開／既受入データは変更していない。タスク2の受入記録・release生成・applyは実行しない。

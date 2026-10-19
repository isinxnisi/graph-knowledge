# 収集候補の一括受入レビュー

正式受入・公開applyではない。重要な同一性・意味判断は人間が確認する。

状態はcontext.jsonで指定した公開snapshot・受入済み追加集合に対する照合結果。過去snapshotによる再現を現在の受入／公開状態に読み替えない。

Job: `issue-25-utc-recovery-r0002-195d12ba8ceee0b8`。公開照合: `20261014-credits-001` / `82b01515-594c-48ca-b4b6-515eefac83ca`（live-readonly-backup）。

新規判断対象: {"entities": 0, "claims": 0, "sources": 0, "citations": 0}。Claim保留 3、Entity保留 3。

原語の未対応表示と取得時の保留はreview.jsonのinheritedHoldsを参照。Identity-only候補は通常グループに自動混入しない。

candidate＝収集候補、formally-accepted-not-applied＝正式受入済み未適用、published-in-public-snapshot＝指定revisionの公開収録確認。保留は今回の入力照合についてであり、既存の正式受入・公開状態を取り消すものではない。

| 人物 → 作品 | Role／ISBN scope | Claim UUID／状態 | 根拠Citation UUID／保留理由 |
| --- | --- | --- | --- |
| 浦沢直樹 → MONSTER | AUTHORSHIP／9784091836519 第1巻（NDL巻次 1 (ヘルDr.テンマ)） | `406aebfe-a6eb-48c1-9d93-b377bbd39d8f`／held（既存状態: None; 対応UUID: None） | 浦沢直樹 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002418467 ; a90932b0-25dc-4ab1-9670-c49fecb805cf／endpoint-identity-held |
| 浦沢直樹 → 20世紀少年 | AUTHORSHIP／9784091855312 第1巻（NDL巻次 1） | `e3356616-466b-4ad1-9a56-079f0e118aa8`／held（既存状態: None; 対応UUID: None） | 浦沢直樹 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002863103 ; a7b3db1c-b6eb-4088-afa6-7f954ee0c4ad／endpoint-identity-held |
| 浦沢直樹 → YAWARA! | AUTHORSHIP／9784091813411 第1巻（NDL巻次 1） | `fb541a79-5cf1-470b-9509-65cb8ede41f3`／held（既存状態: None; 対応UUID: None） | 浦沢直樹 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000001854814 ; 37c7fedf-a002-4ef3-9bc9-32bd655c6509／endpoint-identity-held |

| Entity | UUID／状態 | 同定・保留理由 |
| --- | --- | --- |
| YAWARA! | `4d0910a7-e548-4ba7-9ef0-f03377c7e1fe`／held | Q528619／existing-identity-needs-explicit-uuid-mapping |
| MONSTER | `5939642c-8fe8-459b-98c8-1aef555ba212`／held | Q858384／existing-identity-needs-explicit-uuid-mapping |
| 20世紀少年 | `64859a28-f815-4982-9123-594ffa0cf4f8`／held | Q91458／existing-identity-needs-explicit-uuid-mapping |

## 代表的な探索経路

各接続のRole・scope・状態・Citation／Sourceはexploration-paths.jsonに固定。人物間の直接関係を推測生成しない。公開APIでの実探索確認ではない。最大6経路・各段の候補20件の代表例であり、網羅性を保証しない。


判断対象UUID・scope・参照hashはdecision-request.json。元ジョブ／既存公開／既受入データは変更していない。タスク2の受入記録・release生成・applyは実行しない。

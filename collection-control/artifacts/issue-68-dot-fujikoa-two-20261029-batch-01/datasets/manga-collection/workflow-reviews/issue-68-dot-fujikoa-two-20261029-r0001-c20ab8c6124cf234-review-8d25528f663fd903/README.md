# 収集候補の一括受入レビュー

正式受入・公開applyではない。重要な同一性・意味判断は人間が確認する。

状態はcontext.jsonで指定した公開snapshot・受入済み追加集合に対する照合結果。過去snapshotによる再現を現在の受入／公開状態に読み替えない。

Job: `issue-68-dot-fujikoa-two-20261029-r0001-c20ab8c6124cf234`。公開照合: `20261014-credits-001` / `82b01515-594c-48ca-b4b6-515eefac83ca`（live-readonly-backup）。

新規判断対象: {"entities": 3, "claims": 2, "sources": 2, "citations": 2}。Claim保留 0、Entity保留 0。

原語の未対応表示と取得時の保留はreview.jsonのinheritedHoldsを参照。Identity-only候補は通常グループに自動混入しない。

candidate＝収集候補、formally-accepted-not-applied＝正式受入済み未適用、published-in-public-snapshot＝指定revisionの公開収録確認。保留は今回の入力照合についてであり、既存の正式受入・公開状態を取り消すものではない。

| 人物 → 作品 | Role／ISBN scope | Claim UUID／状態 | 根拠Citation UUID／保留理由 |
| --- | --- | --- | --- |
| 藤子不二雄Ⓐ → 笑ゥせぇるすまん | AUTHORSHIP／9784122033665 第1巻（NDL巻次 1） | `24c99059-18ea-41c3-8bdb-31b8f7635b88`／candidate（既存状態: None; 対応UUID: None） | 藤子不二雄A 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002774952 ; 12e08d4d-a112-4bc2-a92d-0d2c9ceb41fb／ |
| 藤子不二雄Ⓐ → 忍者ハットリくん | AUTHORSHIP／9784122025318 第1巻（NDL巻次 1） | `beb9db1d-fd1c-4697-8db2-0f94bfe416cd`／candidate（既存状態: None; 対応UUID: None） | 藤子不二雄A 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002470546 ; 7f52ce00-7512-4f95-93c6-afb62a1d2ffc／ |

| Entity | UUID／状態 | 同定・保留理由 |
| --- | --- | --- |
| 忍者ハットリくん | `43fc28cc-dfc8-4a92-9741-0a7cf18b8f60`／candidate | Q2318999／ |
| 笑ゥせぇるすまん | `c877b096-26ef-4219-a3f1-0810906b1361`／candidate | Q11599582／ |
| 藤子不二雄Ⓐ | `c9035374-dd08-4aa7-b304-cecbf79cf2b5`／candidate | Q7784543／ |

## 代表的な探索経路

各接続のRole・scope・状態・Citation／Sourceはexploration-paths.jsonに固定。人物間の直接関係を推測生成しない。公開APIでの実探索確認ではない。最大6経路・各段の候補20件の代表例であり、網羅性を保証しない。

- 藤子不二雄Ⓐ → 笑ゥせぇるすまん [AUTHORSHIP; 24c99059-18ea-41c3-8bdb-31b8f7635b88] ; 藤子不二雄Ⓐ → 忍者ハットリくん [AUTHORSHIP; beb9db1d-fd1c-4697-8db2-0f94bfe416cd]／collection-candidate

判断対象UUID・scope・参照hashはdecision-request.json。元ジョブ／既存公開／既受入データは変更していない。タスク2の受入記録・release生成・applyは実行しない。

# 初回研究の検証記録

2026-10-26 JST。独立worktree `codex/exploration-structure-v1`、基準main `d1e3b99603645f327f5d98c61bc6aa73cbd2bc6a`。開始時の自動開発reviewは未反映0 commit、自動側clean、Git操作途中なし。mainの既存未追跡 `memo.txt` は変更していない。調査・待機中は共通holdを解放し、worktree準備と成果物配置・検証・commit／push中だけ保持する。

| 確認 | 結果 |
| --- | --- |
| 公開読取 | 本番APIの固定revisionで128要求を保存。18起点の全近傍、64 Claimの根拠、名前検索、GET／POSTの経路、Role・立場・期間の能力probeを含む。未対応条件の400を成功経路へ代用しない |
| 正式受入資料 | 既存 `Inventory.formal_receipts` を読取利用。10 receipt、184参照、issues=0、readset前後不変。66 Entity／51 Claim／44 Source／52 Citationの受入内容を検証。receiptのSHA・元本文・検証済み投影をgzipへ保存 |
| 固定control | `c189e0634c5c18596df968f68a48003da2153056` のIssue #16関連4ファイルをGitHub接続ツールで取得し、ローカル保存byteのGit blob ID／SHA-256と照合 |
| 保存観測の再現 | `python3 scripts/exploration-structures.py --check` 成功。入力・検索コード・定義hash、revision、cursor連続性、代表10経路の方向・条件・支持根拠、正式票との対応、保存JSON一致 |
| 新規の必要最小限の検証 | `python3 -m unittest discover -s tests -p test_exploration_structures.py -v` **5件成功**。1辺の実測と2辺仮説の区別、データ／証拠／コードの独立差分、保存改変拒否、checksumを更新したrevision混在の拒否、取得中の版変化で観測未確定を確認 |
| 既存処理の再利用 | `python3 scripts/collection-bridge-candidates.py --check` 成功。4テーマの旧結果を変更せず再現。新しい小群の成分・到達計算も同スクリプトのgraph／reachを再利用 |
| 差分比較 | 同じobservations.json同士の比較で、追加・削除・内容・証拠差分なし、コード・定義・API挙動・環境・範囲・revisionの変更flagが全てfalse |
| 文書・差分 | 文書のローカル参照先、代表経路のEntity／Claim／Citation／Source、`git diff --check`を確認。外部原資料の再取得や、公開画面での操作試験は今回行わない |

研究用の手動読取・比較CLIを追加しただけで、既存のWeb、API実装、DB、Worker、プリセット定義、収集・受入・公開処理には変更がない。Webの全build／全E2Eは対象外で、3200／beta／VPSの再build・配置・DB同期も行わない。

観測時の3200は200・revision `82b01515-594c-48ca-b4b6-515eefac83ca`、本番は200・revision `b74a4b00-9454-412f-af5d-1317713a543c`。beta匿名HTTPは403で、この経路の代表探索は未確認。旧ローカルの公開データへ本番の経路を混ぜず、環境差・確認できた範囲を[初回報告](README.md)へ明記した。今回の成果物は研究branchのcommit・pushで共有し、main受入・本番反映と区別する。

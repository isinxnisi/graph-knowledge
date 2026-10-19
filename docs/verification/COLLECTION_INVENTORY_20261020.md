# Issue #32 Phase A：実データによる統合棚卸し

2026-10-20 JST。読み取り専用CLIを追加し、[Markdown一覧](../../datasets/collection-inventory/20261020-phase-a/README.md)と[機械処理用JSON](../../datasets/collection-inventory/20261020-phase-a/inventory.json)を生成した。仕様と操作は[COLLECTION_INVENTORY](../design/COLLECTION_INVENTORY.md)。

## 比較対象と実測結果

公開KGは既存backup CLIで01:37:24 JSTに実取得した。比較releaseは`20261014-credits-001`、revisionは`82b01515-594c-48ca-b4b6-515eefac83ca`。checksum／schema／graph fingerprint／履歴とrelease本文の一致を既存validatorで確認した。報告はこの供給済みsnapshotを入力に生成しており、後刻の現在状態と読み替えない。

GitHubは別の読み取り用mirrorへcontrol branchを取得し、固定commit `f696797617d111d5fa8166ea7648eb5621c82c0d`を入力とした。本運用Workerのmirror・state・scheduler・キューは変更していない。main、設置済みruntime、固定control artifactを突合し、同一hashの複製を重複加算しない。

| 主状態 | Entity | Claim | Source | Citation |
|---|---:|---:|---:|---:|
| 公開snapshot収録 | 2,109 | 1,844 | 1,751 | 1,880 |
| 正式受入済み未公開 | 52 | 40 | 33 | 41 |
| 人間承認済み未実行 | 14 | 10 | 10 | 10 |
| 収集・レビュー候補 | 3 | 0 | 0 | 0 |
| 保留 | 4 | 3 | 3 | 3 |
| レコード自体の未解消停止 | 0 | 0 | 0 | 0 |

正式受入済みの52／40／33／41は全てreceiptで裏付けられた累積releaseにも収録済み。`release-prepared`という別属性であり、主状態へ再加算しない。旧部分release -001／-002とr0003の累積releaseを合算していない。新しいvalidate／plan・公開判断は今回実行していない。

- 正式receiptはr0002、原作追加r0002、r0003の3件。r0003の31 Claimには収集28件と追加資料3件を含む。
- #25のregister `issue-25-20261019-normal-10`は14 Entity／10 Claim／10 Source／10 Citation。全6グループの人間判断・UUID・本文hash・Role・scope・レビューと根拠inventoryを確認した。`issue-25-utc-recovery-01-normal`だけがWorker受付済みのwaiting-control（outside-window）、残り5件はregister内の承認済みenvelopeで、Workerへは未投入。
- 未受入の同定のみ候補は「黄泉のツガイ」「藤子・F・不二雄」「荒川弘」の3 Entity。関係の受入を含意しない。
- 保留Entityは村田雄介と、既存UUIDへの対応判断が必要なMONSTER／20世紀少年／YAWARA!。後3作品のAUTHORSHIP 3 Claimと支持資料も保留。名前／QID一致だけで公開Entityへ統合しない。
- 原責任表示等の未構造化保留は同一本文をまとめた17項目。歴史的観測として由来を保持し、現在のUUID状態を確認する。過去に保留と記された後で正式受入された原作等を、新たな未受入レコードとして数えない。
- 準備段階の現在保留は6作品（NARUTO、かぐや様は告らせたい、ジョジョ第1部、鋼の錬金術師、銀の匙、キテレツ大百科）。同定・代表刊行物・ISBNの一意再確認が未解決。修復前の23作品保留は旧観測として残す。
- Worker履歴は22依頼（completed 12、blocked 8、waiting-control 2）。旧blocked 8件と旧waiting-control 1件には9件の復旧完了依頼が対応しており、現在の失敗9件とは扱わない。各ID・元hash・理由・復旧先を保持した。
- パイナップルARMYのEntity 1対応・Claim 2対応は正式receiptの明示記録を使用。対応後の全フィールドが一致する旧Citation 2件も受入済みCitationへ紐付け、受入待ちCitationとして重複計上しない。旧本文・元hash・UUIDは由来に保持。
- 完了収集job 12件と収集テーマ29定義版を観測。企画／収集実行許可を個別知識の正式受入へ変換しない。

この観測で欠落・hash不一致・未被覆の正式受入・依存不足は0件。保留理由が解決済みになったことを意味しない。全対象UUID、Role、ISBN scope、Citation／Source、依存、承認IDと出典hashはJSONに保持する。

## 検証

棚卸しの単体16件が成功。承認と正式受入の区別、部分失敗後に同定対応／承認が残らないこと、本文・scope・根拠・比較baseの改変拒否、別ISBN／未対応UUIDの非統合、正式Claim対応後の同一Citationだけの重複排除、保留の依存伝播、公開撤回の保持、入力途中変更・保護領域への出力拒否、JSON／Markdownの再現性を確認した。

既存のcollection acceptance／workflow／themes／issues／recovery／Worker／controlの回帰97件も成功した。全collection系の実行開始時に存在した棚卸し11件との一括実行は108件成功（551.7秒）、その後追加した5件を含む最終棚卸し16件も別途成功。異なる検証ケースは合計113件。既存受入テストの判断・receipt・releaseは隔離一時領域の模擬入力で、plan／公開観測は試験置換。実運用への新規受入ではない。

実CLIは同じ供給backupと固定control treeから再実行し、同じJSON／Markdown・reportUnchanged=trueを確認した。runtimeを省略したmain＋GitHub共有artifactだけの実行も、全主状態件数・準備済み件数が一致し、欠落・不整合は0件。由来が異なるため、その別観測のinventory hashは異なる。Python構文検査と`git diff --check`も成功。

## 再現方法と不変性

実取得snapshotはローカルのGit対象外`backups/collection-inventory-20261020-public.json`に保存した。個人情報や秘密設定を含む会員DB backupは作成していない。固定control commitは設置済みWorkerのmirrorにも存在するため、次で再読込できる。

```bash
env PATH="/tmp/graph-knowledge-node/bin:$PATH" \
python3 scripts/collection-workflow.py inventory \
  --public-backup backups/collection-inventory-20261020-public.json \
  --runtime ~/.local/share/plunode-collection-worker/runtime \
  --control-git ~/.local/share/plunode-collection-worker/control.git \
  --control-ref f696797617d111d5fa8166ea7648eb5621c82c0d \
  --output datasets/collection-inventory/20261020-phase-a
```

このsnapshotはリポジトリに含めず、再現時に必要な入力として保持する。固定GitHub artifactは元commitから取得でき、レポートに全参照hashを残す。

棚卸し前後の実backupはsavedAt以外の全payloadが一致。公開release／revision・知識・外部ID UUID・receipt・identity・撤回履歴が不変だった。既存の正式receipt・承認・凍結資料にも変更はない。

ローカル3200の`/api/dataset`は200、同revisionを維持。betaもWindowsのcurl経由で200・同revisionを確認した（WSLのPython経由は403だったため、Windows側の到達経路で確認）。サービスの画面・API・DBを変更しておらず、Web再build／再配置は不要。VPS・会員DB・公開apply・restore・実収集・実正式受入・Workerの操作変更は行っていない。

## Phase Bで解決すること

1. 6グループを逐次処理するたびに増える既受入集合と公開baseを再比較する。古い比較を拒否する既存検査を回避せず、元承認のUUID・本文hash・Role・ISBN scope・全支持資料・依存と、更新したレビューの完全同一性を機械検証する。
2. register内の未投入5件と受付済み1件の進行を追跡し、同じ承認の二重受付・二重receipt・release ID再使用を防ぐ。元承認・失敗・復旧・凍結資料は追記参照で維持する。
3. receipt保存、累積release、validate、最新無書込planを分けて失敗・停止・再開を検証する。意味・同定・根拠・依存に差があれば保留して人間へ返す。
4. 既存Workerの共通ロック・03–07／09–12／15–18 JST・10分休憩・55分上限を維持し、PC／WSL停止中は進まない。新しいAI定期実行や常駐サービスを必須にしない。

Phase Bの実運用投入は未実施。今回の報告やIssue #32を、受入実行・公開applyの追加承認として扱わない。

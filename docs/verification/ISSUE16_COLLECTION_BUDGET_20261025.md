# Issue #16：30試行承認の受付・既存成果再利用（2026-10-25）

## 目標と到達範囲

承認済みの「あだち充→タッチ／H2／MIX」を、既存CollectionWorkerで追加承認・手動Worker起動なしに処理できる状態へ戻す。

**通常の毎分起動による受付を確認した。** 親依頼 `issue-16-adachi-three-20261025` は `waiting-control / Execution gate: outside-window`、実行回数0。通信上限の `held` は解消している。現在は時間帯外なので、**次回開始可能は2026-10-25 15:00 JST以降**。実際の準備完了を先取りして報告しない。時間帯・pause・共通ロック・休憩条件は引き続き適用される。

- [実依頼](https://github.com/isinxnisi/graph-knowledge/blob/codex/collection-control/collection-control/requests/issue-16-adachi-three-20261025.json)
- [受付・処理状態](https://github.com/isinxnisi/graph-knowledge/blob/codex/collection-control/collection-control/results/issue-16-adachi-three-20261025/README.md)
- [実機検証JSON](ISSUE16_COLLECTION_BUDGET_20261025.json)
- [実データの隔離一巡・復旧試験](ISSUE16_COLLECTION_ISOLATION_20261025.json)

## 原因と修正

`collection-issues.py` が承認値 `requestPolicy` と既定142試行のdictionary完全一致を要求し、承認済み30試行を拒否していた。既定値142は維持し、**maxAttemptsだけ整数1〜142の縮小を許容**する。取得元Wikidata＋NDL、同一要求2回、3秒間隔、20秒timeout、4MiB、キー集合と整数型は固定する。既存許可の内容変更は引き続きhash不一致で止める。

実行には人間が承認した30をそのまま渡し、親準備と子collectorが同じ専用cacheを使う。31回目の送信を再起動後も拒否する。元Issue #25の89／142履歴を新予算へコピー・リセット・再リンクしない。key＋URLが一致する既存のresponse bodyだけをSHA・サイズ・元index SHA付きで複製し、不足取得だけ新予算へ送信前に計上する。元のRetry-Afterも保持する。

新しいIssue親依頼へ実配置 `issueAdapterSha256` を固定し、準備開始前に照合する。従来のSHA未記録依頼は互換維持する。未完了の新依頼を後日の別実装へ黙って再束縛しない。

## H2／MIX／タッチの照合

ローカル比較KGは20261014-credits-001（1,844 Claim）のまま、本番は1,895 Claimである。正式受入済み51 Claimを再受入・再公開しない。今回、ローカルDBの更新で解決せず、旧収集の凍結review／job／provider bodyと、正式receipt・本番の読み取りAPIを照合する再利用経路を追加した。既存KGの読取照合は外部書誌provider取得ではなく、承認30試行とは別の既存データ検証である。

| 対象 | 正式公開済みClaim | Role・scope | 処理 |
| --- | --- | --- | --- |
| H2 | `f1260c3f-2637-416f-b407-2052a7c36717` | AUTHORSHIP、日本語第1巻ISBN9784091231512 | 完全一致のreceipt／APIと既存成果を再利用し、新しい収集ジョブを作らない |
| MIX | `c72262df-ce7b-4514-9341-55d242f94bca` | AUTHORSHIP、日本語第1巻ISBN9784091238672 | 同上 |
| タッチ | 新しいClaimなし | ISBN9784091218612、NDLのvol.1 | 既存の `publication-identity-unconfirmed` を保留のまま再利用 |

本番revision `b74a4b00-9454-412f-af5d-1317713a543c` でH2／MIXのUUID・本文・Role・scope・Citation・Sourceを確認した。タッチは「児童図書／漫画」の書誌同定条件と「あだち充 原作」の責任表示を保持し、AUTHORSHIPへ変換しない。

再利用は、同じ人物QID・作品QID・ISBN・巻／版、同一のprovider body SHA、凍結job／review hashを満たす場合に限る。公開済み扱いには、正式receiptから検証したレコードと本番APIの完全一致が必要。APIのRole・scope・根拠不一致は停止し、新しい意味判断で埋めない。既存の保留は過去の観測として出典を付けて残す。

この実データでは、隔離一巡は16応答を再利用し、不足するWikidata照会1回を模擬、1／30試行、再収集ジョブ0、新規Claim0、既公開2 Claimの再利用、タッチ1作品保留へ到達した。実Workerでの取得・完了件数は別であり、受付時点は0／30・未実行である。

## 隔離検証

- policy／実行予算9件：縮小1・30・141、既存142、143以上・0・非整数拒否、他policy変更拒否、30回送信後の31回目拒否、restart・子collector共有予算、旧89／142不変、cache改変拒否、Retry-After、adapter SHA固定。
- 既存Issue連携13件、Worker／時間帯・休憩32件：成功（計54件）。
- 実データをtemporary directoryへ複製し、実source-commit検査、schema validator、旧成果再利用、本番API形式との比較を検証。実provider通信・実Worker起動・DB書込なし。
- 公開Role不一致の拒否、通信断、凍結検証データ保存後の停止、receipt改変拒否、同じas-of proofからの再開、完了resultの再利用を確認。新しいpublic revisionへ凍結proofを再束縛せず、provider試行数も増やさない。

## 実Workerへの反映

修正 `c95d94e` をmainへfast-forward・通常pushした。共通holdと実Workerの非待機flockを取得し、実行中attemptがない安全な境界で **collection-issues.pyの1ファイルだけ** を原子的に配置した。旧版とmaintenance receiptを以下へ保全した。

`/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020/issue16-module-backport-amndib9b`

- 固定Worker本体・排他／collector／workflowコード、config、公開側peerが参照する互換基準 `973c7b0` は維持した。
- これはruntime全体をc95d94eへ更新したという意味ではない。追加の実配置adapter SHAは **9e0231ab0f444e181e6672d28759b729c108ae2d7816915789a794ba1465656e**。mainの取得元commit・前後SHA・不変コードhashをmaintenance receiptと新しい実依頼へ記録した。
- 既存source-commit不一致拒否、承認hash、ロックinode、Windows task、時間帯・10分休憩を変更していない。Workerの停止・手動起動・強制解除・state編集はしていない。
- 正式receipt10件、旧成果・cache等1,066ファイルを前後比較し、不変を確認した。Issue #25は89／142のまま。
- 配置後、通常の毎分起動がIssue #16を `registered` へ移し、30試行・人間判断の原時刻11:22:31 JST・新adapter SHAを持つ不変依頼／Issue receiptを自動登録した。GitHubの固定control commitで確認した。

必要時の切戻しも共通hold＋Workerロック下で、保全した単一moduleだけを戻す。既存依頼のhash・approval・result・cacheを上書きしない。旧版へ戻すと30試行の受付／新adapter SHA付き依頼は安全停止する。通常継続には検証済みの同一moduleを再配置する。実行中処理を止めたり、進捗stateを過去へ一括restoreしない。

## 残る判断と次の操作

今回の不具合修正・既存承認による自動処理継続に、追加の人間承認・Codex往復・手動CLI起動は不要。PCが稼働し、既存の制御条件を満たせば、15時以降の通常Workerが準備と既存成果の共有を行う。

タッチをさらに補充するかは、刊行物同定・原作クレジット・別根拠の判断として残る。今回その保留を推測解除しない。正式受入・本番公開apply・VPS・会員DB・検索UIは変更していない。Webコード変更はなく、3200／beta／VPSの再build・配置も行わない。

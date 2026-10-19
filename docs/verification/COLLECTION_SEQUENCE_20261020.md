# Issue #32 Phase B：承認済み受入の逐次継続

2026-10-20 JST。実装方針は[逐次継続の設計](../design/COLLECTION_ACCEPTANCE_SEQUENCE.md)、主ケースの元承認はcontrol branchの`issue-25-20261019-normal-10.json`。コード・隔離検証・未承認の実行雛形までを対象とし、実運用の新Worker設置・依頼投入・正式受入は実施しない。

## 現在の実運用状態

開始時に独立した読み取り用mirrorでGitHubを取得し、固定control commit `8b5bd407bd264920d398fbf543bdc226df7878a1`を確認した。既登録の最初の`issue-25-utc-recovery-01-normal`は`waiting-control`、理由`outside-window`、試行0回。固定GitHub statusの最終更新は2026-10-19 21:07:43 JST。2026-10-20 02:55 JSTの実Worker state読み取りでも同じ状態・試行0回・receipt未保存を確認した（state更新時刻02:54:33 JST）。取得時刻と記録の更新時刻を区別する。

設置済みruntimeの正式receiptは従来の3件だけ。Phase Aの棚卸しCLIを再実行し、正式受入済み未公開52 Entity／40 Claim／33 Source／41 Citation、承認済み未実行14／10／10／10、欠落・不整合0を確認した。棚卸しinventory hashは`575da1aaf97d4a7a6ac551e4944ac5ab8bb3435d212d237b4634af6d3dd31ecc`。公開snapshotはPhase Aの供給済みbackupを使っており、新たなライブ観測とは表示していない。

最初の依頼を再登録せず、受入も代行していない。残り5グループもcontrol branchへ新規投入していない。新Workerを稼働させる前に、元Worker／元依頼の完了とreceipt・公開準備の完了を確認する。

## 実装で維持した契約

- 元approved判断ファイルの全文、全対象UUID・レコード本文hash・Role・ISBN scope・Source／Citation・端点依存・人間判断日時を不変にする。
- 全正式receiptから新しい比較集合を構成し、元の完了jobと凍結provider成果からレビューだけを更新する。新旧の対象本文・全依存集合のhashが一致した証明を、元判断とは別ファイルに保存する。
- 既存accept-releaseの比較外受入拒否・公開base／revision照合を維持し、receipt保存直前にも再検査する。通常の古い判断だけで後続受入する経路は引き続き拒否する。
- receipt保存後の準備失敗では、受入を再実行しない。現在の全receiptを検証して累積release・validate・最新の無書込planだけを再構成する。元receiptの日時・参照先・旧releaseは変更しない。
- 既存Workerの時間帯・共通ロック・受入rootロック・1試行1グループ・10分休憩・55分上限を使う。共有失敗は保存済み結果の共有から再開する。
- 不変成果の共有pathを維持してPhase Aから参照できるようにし、可変の進捗・準備報告はhashごとの追記snapshotにする。
- 比較中に繰り返し登場するJSONは、その検証内だけで同一path・同一SHA-256の解析結果を再利用する。各参照の実ファイルhashは毎回照合し、受入可否や古い比較集合をキャッシュしない。

## 隔離検証

新しい逐次処理のケースは、最初の未実行／準備未完了時の待機、共有依存の正式受入後の再利用、元判断の不変と再実行、Role・ISBN・Source・Citation変更の拒否、別判断による同じClaimの受入拒否、receipt前の停止、receipt後のrelease生成／validate／plan失敗、無関係な受入の増加、元承認・receipt・releaseの改変停止を検証する。

Worker側は未承認／AI判断／scope／apply権限の拒否、元依頼完了の必須条件、元依頼・registerの改変／取消による停止、時間帯と10分休憩、1回1グループ、共有だけの再試行、不変成果の共有pathと可変state snapshotを確認する。既存の収集・受入・Issue準備・復旧・Worker制御・棚卸しも回帰対象とする。

全collection系134件が成功（717.3秒）。その後、不変成果の共有path、旧runtime絶対pathの移行互換、人間判断が必要なエラーの明示停止、比較後の競合受入を加えた最終逐次処理・Worker制御26件も成功（11.9秒）。重複を除いた検証ケースは139件。コードのJSON解析再利用後にも、既存workflowの凍結再現・hash改変拒否・取得なし再レビューを含む16件が成功（223.7秒）。エラー分類の共通処理変更後に既存Worker・制御32件も成功（23.6秒）。途中の試験版通し実行は、最終の通し検証へ一本化するため終了し、成功件数には含めない。

実データの通し検証には、元registerと6レビュー群、凍結job、正式受入3件、Phase A公開backupを使う。**全ての模擬receipt・release・比較・証明は一時runtimeへ保存**する。元の実運用runtimeは読み取りだけ。実schema／release validatorを使用し、DB snapshot・planは明示的な試験置換であり、実DBへの受入や実plan成功の証明ではない。

[実データ検証JSON](COLLECTION_SEQUENCE_20261020.json)（SHA-256 `2d996449a46f515edf3a44e462924c03ca324c52304fa6249a8c93a3e2d6a09e`）で全6グループの完了を確認した。元承認の10 Claim／14 Entity／10 Source／10 Citationを変更せず、先行受入を含む比較へ更新できた。

| 元decision末尾（全て`issue-25-utc-recovery-`配下） | 承認Entity | Claim | Source | Citation | 隔離検証結果 |
| --- | ---: | ---: | ---: | ---: | --- |
| 01-normal | 1 | 1 | 1 | 1 | 元依頼の模擬処理を1回だけ実施。sequenceによる再受入なし |
| 03-normal | 1 | 1 | 1 | 1 | receipt後のplan中断から、同じreceipt・日時のまま準備再開 |
| 04-normal | 2 | 1 | 1 | 1 | 先行受入を反映して継続 |
| 06-normal | 4 | 3 | 3 | 3 | 同上 |
| 07-normal | 3 | 2 | 2 | 2 | 同上 |
| 08-normal | 3 | 2 | 2 | 2 | 同上 |

最終累積追加は**66 Entity／50 Claim／43 Source／51 Citation**（従来の52／40／33／41＋今回承認の14／10／10／10）。一時runtime内のreceiptは従来3件＋模擬6件の9件で、実運用側は3件のまま。既存の実validator呼出66回が成功し、plan呼出7回は明示的な試験置換（うち1回は意図的に中断）である。古い比較による通常accept-releaseの拒否、失敗後のreceipt／decision／accepted-records／manifestのhash不変、完了再実行による受入・plan追加なし、監視対象の元承認・レビュー・正式受入65ファイルのhash不変も成功した。各対象UUID・判断本文hash・receipt hashはJSONに保存した。

通し検証に使用したコードのhashはJSONの`validationRuntimeSha256`に固定している。その一時runtime作成後の最終差分は、`collection-sequence.py`の旧絶対path互換、`collection-workflow.py`／`collection-worker.py`の明示的な人間判断エラー伝達であり、これらは上記の最終26件と既存Worker32件で別途検証した。全件通し検証を最終3差分まで同時に実行したとは扱わない。

同一性に関するValueError／構造不正はCLIが`humanReviewRequired=true`を返し、Workerは未知の文言でもblockedへ移る。blockedは通常の予定確認や再起動で解除しない。I/O・子プロセス中断は保存済み段階から再試行できるため、同一性の否定と一時的な実行失敗を区別する。

再現コマンド（既存の手動共通ロック内）：

```bash
env PATH="/tmp/graph-knowledge-node/bin:$PATH" \
python3 tests/check_collection_sequence.py \
  --runtime ~/.local/share/plunode-collection-worker/runtime \
  --control-directory /tmp/graph-sequential-20261020/control \
  --control-sha 8b5bd407bd264920d398fbf543bdc226df7878a1 \
  --public-backup backups/collection-inventory-20261020-public.json \
  --report /tmp/collection-sequence-check.json

python3 -m unittest discover -s tests -p 'test_collection_*.py' -v
```

control-directoryは上記固定Git treeの`collection-control/`を含む読み取り用展開先。未取得の環境では別の読み取り用mirrorから同じcommitを展開する。実Workerのmirror・state・Windows設定を更新する操作ではない。

## 実運用へ進む前の判断

1. 元の最初の依頼が完了していることをGitHubと不変receipt・公開準備から再確認する。waiting／blocked／途中receiptなら元依頼の完了・復旧を優先し、新Workerで重複受入しない。
2. レビュー済みコードの固定commit、元registerのバイトhash `82b53f2bb1e0c1e5402af117a22de2a809ecf0588a56743e6aaef3258b42e8d6`、旧runtimeの全記録・ジョブ・cache・state引継ぎを確認する。
3. 別の明示的な実行判断が出た場合だけ、未承認雛形を出発点に新Worker設置・sequence依頼の登録を行う。今回は行っていない。
4. 同一性・意味・根拠・依存・公開版が一致しない停止は、自動的に解除しない。元承認を書き換えず、人間の判断へ返す。

公開apply・VPS・会員DBは引き続き対象外。画面・API・DB schemaに変更はなく、Web再build／再配置も行わない。

ローカル3200と日常確認先betaの`/api/dataset`はともにHTTP 200、公開release `20261014-credits-001`／revision `82b01515-594c-48ca-b4b6-515eefac83ca`を確認した。Web経路・設置済みWorkerコードの更新を今回の実装反映と混同しない。

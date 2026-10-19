# 未公開データの統合棚卸し（Issue #32 Phase A）

2026-10-20。対象は公開KGの実測snapshot、既存の正式受入receipt、累積release候補、漫画収集・レビュー、GitHub control branchの承認register・依頼・結果。受入漏れと停止を確認するための読み取り専用集計であり、Phase B／Cの実行は含めない。

## 操作

既存の手動作業ロック内で、mainの既存Python CLIを利用する。Node24と既存依存は公開backupの検証に使う。Workerを起動・再設置したり、定期的にCodex・有料AIを呼んだりする必要はない。

```bash
python3 scripts/collection-workflow.py inventory \
  --runtime ~/.local/share/plunode-collection-worker/runtime \
  --control-git ~/.local/share/plunode-collection-worker/control.git \
  --control-ref FULL_40_CHARACTER_COMMIT_SHA \
  --output datasets/collection-inventory/NEW_OBSERVATION
```

`--control-ref`は確認した固定SHAを指定する。コマンド自身はGit fetch／checkout／pushを行わず、既存mirrorの固定treeを一時領域へ読み出す。GitHubの新しい状態が必要なら、既存Workerが取得したcommitを確認するか、別の読み取り用mirrorへ取得する。実行中のWorkerのstateやmirrorを棚卸しから更新しない。結果にcontrol commit、各依頼のupdatedAt、ファイルSHA-256を残す。

`--runtime`は省略可能。省略時はmainとcontrolの共有artifactだけを集計し、共有前にruntimeにだけ存在する記録は観測できない。runtimeを指定すれば、main未同期の受入記録・完了ジョブも参照できる。検証用trialや無関係なbackupは探索しない。

公開KGは既存`public:backup`でローカルから読み、既存`validatePublicBackup`でchecksum・schema・graph fingerprint・receipt／identity／撤回履歴を検証する。release artifactとの一致も既存workflowで検証する。`public:plan`、apply、受入、収集は呼ばない。VPS・会員DBへ接続しない。

保存済み観測を再現する場合は`--public-backup BACKUP.json`を追加する。この場合は「供給snapshotであり現在の公開状態の再確認ではない」と表示する。観測時刻にはbackupのsavedAtを使い、生成時刻で資料を量産しない。同じ入力・固定control SHA・コードならJSON／Markdownは同一になる。既存出力が異なる場合は上書きせず、新しい出力ディレクトリを要求する。

## 正本と集計規則

| 主状態 | 判定根拠 |
|---|---|
| published | 検証済み公開snapshot内のレコード。Claimはvisibility=publishedだけ |
| formally-accepted-unapplied | 正式receiptの明示UUIDと、hashで固定されたレビュー本文・Role・scope・許可済み編集注記が一致。公開snapshotには未収録 |
| human-approved-pending-execution | 承認registerまたはWorker受入依頼の人間判断、全UUID／本文hash／Role・scope／レビュー・根拠inventoryが一致。receiptは未保存 |
| candidate | 未受入の収集・レビュー済みレコード。同定のみの候補を関係受入へ含めない |
| held | レビューの保留、正式受入からの明示除外、同じUUIDの未承認本文の食違い、公開撤回。保留Claimだけを支持するCitation／Sourceも保留 |
| blocked | 実行・証拠不整合による停止を表すための状態。Worker依頼のblockedは別の履歴集計であり、復旧済みレコードをこの状態へ戻さない |

主状態は排他的で、公開→正式受入→人間承認→保留→候補の順に優先する。公開撤回は保留を優先し、過去receiptから再公開対象へ戻さない。過去の「未受入」「保留」という記述自体は残す。

`release-prepared`は別属性とする。checksum・歴史的baseの不変・全追加レコードのreceipt被覆が一致するreleaseに限る。旧部分releaseと最新累積releaseの収録を重複加算しない。この属性は現在baseへの新しいvalidate／planや公開承認の代わりにならない。receipt保存後にrelease準備が失敗しても、正式受入件数から除外しない。

基本キーは型＋UUID。receiptに明示されたEntity／Claim UUID対応だけを参照上でまとめる。別ISBN・版・RoleをSPOや名称で統合しない。パイナップルARMYの旧Citation2件は、正式なClaim対応を適用した後、id以外の**全Citationフィールドが一致する場合だけ**受入済みCitationの履歴としてまとめる。対応根拠と旧UUID／本文hashを`derivedCitationMappings`へ残す。新しい同一性判断や保存データの書換えは行わない。

## 出力と欠落の扱い

- `inventory.json`: 型別UUIDの一意な台帳。主状態、準備状態、由来hash、承認ID、元／対応先UUID、未公開本文、Role／ISBN scope、支持Citation、Source依存、保留理由、次の手順を持つ。公開本文は同一確認済みrelease artifactを参照する。
- `README.md`: 状態別件数、全未公開Claimとその他レコード、承認6グループの受付状況、旧停止／復旧依頼、準備段階の保留、企画／実行許可、根拠ファイルhashを一覧にする。
- `issues`: receipt・レビュー・releaseのhash不一致、欠落、依存不足等。検証できない資料を正式受入／承認へ昇格しない。入力が処理中に変われば出力を確定しない。

収集企画・未確定作品名・原責任表示の保留には未発行のUUIDがある。Entity／Claim件数へ換算せず、企画・準備・未構造化保留として別に記録する。過去の準備23作品保留と、修復後の現在6作品保留を合算しない。旧停止8依頼・復旧完了依頼はそれぞれのIDを保持し、recoveryOf／recoveredByから辿れる。

対象となるレコード形式は既存の本運用collection jobs、漫画レビュー、正式receipt。凍結pilotや隔離検証用のデータは未公開本運用候補へ混ぜない。棚卸しの情報欠落と、収集範囲外・同定未解決の保留を区別する。

## Phase Bへの引継ぎ

今回の観測では承認済み10 Claimのうち、Worker登録済みは最初の1グループだけ。残り5グループはregister内の承認済みenvelopeとして保存されている。registerへの保存とWorker受付・実行完了は別の状態である。

後続は、6グループの各受入後に変化する既受入集合を都度比較し直し、元承認のUUID・本文hash・Role・scope・支持Citation／Source・元レビューhashと再レビューの同一性を証明する必要がある。現在の`accept-release`が古い比較集合を拒否する検査は維持する。意味・同定・根拠・依存が変われば新しい人間判断へ戻す。承認記録を上書き・再割当しない。

receipt→累積release→validate→最新無書込planの各段階と、二重処理・ロック競合・停止再開を隔離検証する。既存Workerの03–07／09–12／15–18 JST、10分休憩、55分上限、PC／WSL停止中は進まない条件を維持する。Phase Bの実運用投入と公開applyは別の判断であり、本実装から実行しない。

検証は[2026-10-20の記録](../verification/COLLECTION_INVENTORY_20261020.md)を参照。

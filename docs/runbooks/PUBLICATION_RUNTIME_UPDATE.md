# 公開実行版更新の短い入口

Web／operator／gate／delivery／固定Worker／Windows Taskの更新を始める時に読む。固定値の正本は実設置のmanifest・設定・今回の判断票。完了記録は最後の既知状態であり、現在値の代用にはしない。[直近の設置・復旧記録](../research/publication-pipeline-bundle2-20261028/rollout/COMPLETED.md)／[今回の是正と検証](../verification/PUBLICATION_RUNTIME_UPDATE_GUIDANCE_20261029.md)。

## 1. 作業を選ぶ

|作業|入口|
|---|---|
|既存実行版で扱えるデータの追加・受入・公開準備|[収集・受入契約](../design/COLLECTION_WORKFLOW.md)と[公開準備](../design/PUBLICATION_PREPARATION.md)。実行版を毎回更新する必要はない|
|実行版・固定Worker・Taskの更新|以下の設置照合→更新全工程の隔離確認→固定引渡し|
|初期導入・権限の新設|[導入契約](PUBLICATION_GATE_INSTALLATION.md)。導入用readinessや旧installerを稼働環境の更新入口として使わない|
|署名後の結果不明・公開後の終了処理|設置済みdeliveryの同nonce診断（`--diagnose`）、gate status、[協調・復旧契約](PUBLICATION_COORDINATION.md)。新nonce・再署名・再applyで解消しない|

## 2. 設置版と入力の正本を読む

共通ロックの扱いはAGENTSに従う。既存権限で読めるものを先に確認し、SSH／sudoが必要な読取は運営者操作の先頭へまとめる。秘密鍵・全env・会員データを出力しない。

|対象|調べるもの／既存の読取入口|
|---|---|
|VPS gate／operator／Web|`/var/lib/plunode-publication/trusted/` のconfig・program-manifest→設置ファイルのhash、operator pin、実container/image・Node・Web能力。[既存exporter](../../ops/export-publication-consumers.py)を内容確認・固定して使う。古いrequestのimageやmain HEADから推測しない|
|WSL delivery／approver／peer|`/etc/plunode-publication/` の設定と保護入口→参照source→root所有の固定source。設定・manifest・実ファイルを照合する。mainに存在しない版は設置元commitから調べる|
|固定Worker／Task|実TaskのAction→launcherの`--config`→runtime、base pin、collector、既承認依頼、全receipt、全policyファイルと承認済みoverlay。runtimeはGit checkoutとは限らない。TaskのAction以外（trigger/principal/settings/DACL）も変更前snapshotで保持する|
|進行中の処理|gateのjobs・reservations・exclusion・監査待ち、delivery job、preparation state、Worker attempt、実lockとTask状態。idle／attemptなしだけでロックが空いていると判断しない|

|データ形式|producer／照合先|
|---|---|
|`jobs/<nonce>.json` と `<nonce>-backup.json`|[executor](../../scripts/publication-executor.py)のstate保存・preflight。stateとchecksum/payload形式のbackupを区別し、nonce対応と終端・監査を確認|
|`jobs/install-readonly-backup.json`|[初期導入producer](../../ops/install-publication-disabled.py)→保護された`trusted/installation.json`の来歴・SHA・path・snapshot識別。名前だけで無視しない|
|正式receipt・受入資料|[受入producer](../../scripts/collection-acceptance.py)、実runtimeの`datasets/manga-collection/accepted-*`、[棚卸し契約](../design/COLLECTION_INVENTORY.md)。既存UUID・根拠・承認履歴を保持|
|候補・consumer互換契約|[公開準備](../../scripts/publication-preparation.py)、[互換検証](../../scripts/publication-compatibility.py)。必要Role／定義hash、schema・serialization、scope、catalog/reviewsと全利用側の実行版を同じ候補で照合|

未知形式は生成元を調べて停止理由をまとめる。例外を一つ直したら、同じdirectoryの他producerと残りの更新工程も確認する。過去記録を全編読み直す必要はない。

## 3. 既存検証を次の更新へ使う

次のコマンドは開発worktree内の隔離試験のみ。完了済みの`ops/run-publication-bundle2-update.py`・applier・resume・固定包は歴史的実行物であり、将来の汎用入口ではない。既存の関数・fixture・試験観点を次の更新差分と入力に適用し、日付・before hash・旧stage等の定数を流用しない。

```bash
python3 -B -m unittest discover -s tests -p 'test_publication_bundle2_*.py' -v
PYTHONPATH=tests python3 -B -m unittest test_publication_compatibility test_publication_diagnostics test_publication_preparation test_publication_delivery -v
```

|再利用する試験|次の更新で照合すること／試験の境界|
|---|---|
|[journal分類](../../tests/test_publication_bundle2_rollout.py)|state＋nonce backup＋導入snapshot、未知・孤立・未完了・監査待ちの拒否。初期導入receiptとbackupを対で用意。単一stateだけの自作fixtureで済ませない|
|[退避・WSL全工程と差戻し](../../tests/test_publication_bundle2_wsl_backup.py)|今回の全ファイルのbefore/after、相対path退避の一意性、既存backup不一致、新設ファイルの不存在への復旧。Task/lock/所有権/Docker/保護self-check等はmockであり、実権限の成功とは別|
|[Windows Task](../../tests/test_publication_bundle2_task.py)|変更前XML/SDDL、Action変更、保全比較、元例外とrollback例外、snapshot drift。setterはfake、実SDDLは読取のみ。PowerShell不在のskipを成功扱いしない。同source読取はsetter成功の証明ではない|
|[待機・限定再開](../../tests/test_publication_bundle2_resume.py)|待機中に全lock解放、取得直前の競合、期限終了、変更途中・未知失敗の再試行拒否、成功済みホストの非再実行|

旧試験の成功だけで次の更新を合格にしない。**対象全ファイル→退避先→変更分岐→差戻し先**を今回の入力から対応付け、変更前確認からself-checkまで隔離で通す。mock／実読取／実変更を区別し、未検証の権限境界を残す。実行版の互換試験と設置手順の試験は別の確認である。

## 4. 固定引渡しと再開

引渡し前に更新補助・資材・必要な隔離検証も揃える。childの非ゼロ終了／timeout／不正JSONは、工程・終了コード・例外種別・秘匿したstderrを残し、argv・env・候補本文を出さない。現在の互換probeはこの診断を持つが、完了済みinstallerの共通runまで修正されたとは扱わない。

運営者への一回の依頼に、固定対象、対象ホスト／実行主体、必要な権限操作と理由、具体的な固定コマンド、成功時の照合、未検証境界、backup、失敗時の戻し方をまとめる。未確認のroot状態は最初に読み、更新対象のhash・全receipt・未完了job・排他を更新直前にも再照合する。受入・公開署名・権限変更の承認を兼用しない。

|結果|判断|
|---|---|
|変更前の既知lock競合|取得済みlockを全解放して期限付き待機。同じ固定対象の変更前境界だけを一実行内で再試行。probe解放からsudoまでの競合余地は残る|
|hash／receipt／base／Task snapshotのdrift・未知形式|停止して差分を提示。固定対象や承認を勝手に付替えない|
|変更途中・未知の子エラー・rollback未確認|変更済み対象と原例外・差戻し結果を確認。blind retry、成功ホストの再更新、lock削除やTask強制停止はしない|
|成功|全利用側の実設置版、保全対象、通常スケジュールでの再開を照合し、backupを保持。確認不要になった手動holdを解放してから通常運転を観測する|

更新完了時は設置・復旧記録とdocs/READMEの参照先を更新する。このガイドはproducer・Task・lock・検証の入口が変わる時だけ追随し、個別状態を追記し続けない。効果は次の実案件で、追加探索・準備時間・運営者再操作とその理由を確認する。試験件数や読了チェックの増加を成果にしない。

# 公開実行版更新の再発防止・最小是正

## 範囲と判断

基準はmain `952c8fb59fa6ca311121d81a641d3d1b847e7dee` と[原因調査07dceef0](https://github.com/isinxnisi/graph-knowledge/blob/07dceef071ed7434399e658ec85bd5fe05f3ae4f/docs/research/publication-rollout-failure-review-20261029/README.md)。専用worktreeで文書導線と、今後も使う互換probeの失敗診断だけを変更した。調査branch全体を統合せず、稼働環境への適用は行わない。

調査で確定した3不具合は、journalのstate以外の形式の未考慮、導入snapshotの未考慮、同名ファイルの退避名衝突。これらは既に更新コードと既存テストで是正されている。今回同じ修正や別の更新基盤は作らない。PowerShell停止の直接原因は未確定であり、診断強化や最終成功を原因確定とは扱わない。正常な排他待ちは不具合と区別する。

## 短い参照導線

- AGENTSの条件付き入口 → [更新ガイド](../runbooks/PUBLICATION_RUNTIME_UPDATE.md) → 設置版の正本／producer／既存検証／固定引渡しと限定再開。
- docs/READMEは現役の入口と導入当時の記録を区別。ARCHITECTURE冒頭の旧Worker未対応という状態断定も、完了記録と実設置版へ辿る参照に修正した。
- ガイドに個別hash・日付時点の状態を複製しない。完了記録は最後の既知状態、manifest・設定・実ファイル・image・Taskは現在値の照合元とする。ガイドはproducerや入口が変わる時だけ更新する。
- 通常のデータ追加は既存の収集・公開準備へ進み、更新用の調査を常に要求しない。一回限りのbundle2 runner／applier／resume／固定資材は歴史的実行物のまま保持する。

## 再利用する検証と境界

|確定不具合・論点|既存資産と次回の使い方|
|---|---|
|nonce backupをstateとして解釈|`test_publication_bundle2_rollout.py` のjournal分類。executor producerのstateとchecksum/payload backupを同じfixtureに含め、未知・孤立・未完了・監査待ちも照合|
|導入snapshotの取りこぼし|同suiteの`test_installation_snapshot_requires_the_original_protected_receipt`。初期導入producerと保護receiptを対で照合し、名前だけの除外を作らない|
|同名ファイルの退避名衝突|`test_publication_bundle2_wsl_backup.py` の同名別path roundtrip、全工程成功・rollback。次の全対象ファイル→一意退避先→実変更分岐→復旧先を対応付ける|
|Windows Task境界|`test_publication_bundle2_task.py`。PowerShell実インタプリタで7分岐を通すがTask setterはfake、実SDDLは読取のみ。実権限のsetter成功・当時の停止原因は未検証|
|ロック待機・限定再開|`test_publication_bundle2_resume.py`。全lock解放、期限、競合、変更途中・未知失敗の非再試行を再利用。lock probeとsudoの間の競合余地は残り、強制解除で回避しない|

旧テストが通るだけでは、新しい更新対象の合格にならない。次回は入力と変更分岐の対応を確認し、今回の全工程を隔離で通す。Task／lock／所有権／Docker／保護self-check等のmock部分、実読取、実変更を分けて引渡す。この対応付けが今回追加する確認であり、新規テスト数を増やす要件にはしない。

## 実際に再利用する子処理の最小修正

`scripts/publication-compatibility.py:run` は、公開準備 `publication-preparation.py:compatibility` と配送 `publication-delivery.py:describe` で使う。非ゼロ終了時にprogram名しか残さず、timeoutには元argvが例外へ含まれ、不正JSONにも工程情報がなかった。

既存の呼出IF・固定env・180秒timeout・成功時JSON・互換判定・fail closedを維持し、ValueError派生の診断に工程、終了コード、理由、例外種別、errno、秘匿したstderr末尾（最大1600文字）、stdoutのSHAだけを保持する。argv／env／候補JSON本文は出さない。ラベル付き機密行と鍵ブロックは切り詰め前に伏せる。無記名の秘密値全般を検出する保証ではなく、子処理に秘密本文を出させない既存前提は維持する。timeout／起動失敗／不正JSONは元例外の表示を抑え、自動retryや後続consumerの実行を追加しない。

既存 `publication-diagnostics.py` はnonceに結び付くprivate診断を担う。互換probeはその前にも動くため、架空nonceや新しい保存先を作らず、既存呼出側のエラー扱いに渡す小さい修正を選んだ。完了済みapplierの共通runは変更していない。新しい共通実行基盤や追加依存もない。

このソース変更は設置済み固定sourceへ反映されていない。将来この診断を稼働版に入れる場合は、その時点の固定差分・設置対象への判断が必要。今回の文書導線だけは本branchを参照する次のセッションから利用できる。

## 検証結果

実行環境は開発worktree上のWSL Ubuntu／Python unittest。実行コマンドは更新ガイド第3節の2本。

|確認|結果・限界|
|---|---|
|既存bundle2更新・復旧suite|30件成功、14.121秒、skipなし。journal、退避・WSL全工程とrollback、Task、限定再開。Taskは実PowerShellインタプリタを使用したがsetterはfake。実Taskのセキュリティ記述子は読取のみ|
|互換・診断・公開準備・配送suite|47件中46件成功、1件skip、171.622秒。追加は互換probe adapterの3テストのみ（非ゼロ・秘匿と後続停止、timeout／起動失敗、不正JSON／成功値維持）|
|実image試験のskip|`test_actual_pinned_image_validates_and_plans_without_network_or_db` は明示的な専用image・fixture未指定。今回は稼働imageへ接続せず、実公開経路・実権限更新を実行していない|
|参照と変更範囲|追加・変更した導線のローカル参照先を検査。mainにない映画公開完了記録は保存済み固定commitへリンク。完了済み更新コード・PowerShell・固定承認資材は無変更。mainと稼働設置版は更新対象外|

既存suiteの末尾に更新完了風のメッセージが出る場合も、fixture内runnerの試験出力であり実反映ではない。今回の合格はローカル隔離検証の範囲に限る。

## 作業負担と効果の評価

|増える確認|省略を狙う再調査・再操作|
|---|---|
|更新時だけ短いガイドを読み、実設置版とproducerを特定|過去記録の全編再読、main／旧requestからのpin推測、初期導入と更新の混同|
|対象全ファイルと退避・変更分岐・復旧の対応付け|既知の3不具合を再発見して資材を修正し、運営者へ再実行を依頼すること|
|既存fixtureと今回の差分を照合、未検証権限境界を明示|同等の試験基盤の再作成、mock成功を根拠とした早すぎる引渡し|
|停止時に工程・終了コード・秘匿stderrを確認|program名だけからの推測、不明な原因のままの再実行依頼|

削減時間・再操作回数は今回未実測。既存対策の周知と必要箇所の診断で防げる手戻りを狙い、7回が1回になる等の保証はしない。次の実更新案件で、Codexの初回探索・準備／同期待機、運営者への引渡し・再操作回数と理由を比較する。一回限りの実装費と繰り返す確認を分け、ガイドが読まれたかだけで成果判定しない。既存の記録を利用し、新しい計測基盤は要求しない。

main・稼働Worker・Windows Task・VPS・Web・公開KG・会員DB・既存承認／署名／receiptは変更しない。3200／beta／本番の再build・切替・署名・apply・追加sudoは行わない。

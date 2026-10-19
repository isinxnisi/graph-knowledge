# 正式受入済みデータの公開資材（Issue #32 Phase C）

既存のCollectionWorker／accept-releaseが生成した累積releaseを、公開判断用の独立bundleへ凍結する。新しい受入・収集・意味判断・公開apply・restore・会員DB・検索UI変更は行わない。運営者のsudo手順は[runbook](../runbooks/PUBLISH_ACCEPTED_KG.md)。

`scripts/prepare-publication-bundle.py`はWorker runtimeを読み取り、既存40 Claimの3つの正式受入記録と、hashで束縛した#25元register内の正式受入済み判断だけを採用する。register内の未実行判断は受入へ昇格しない。想定外の正式receiptも自動で今回の公開へ追加しない。

Phase Aのformal_receipts、Phase Bのregister／saved_receipt、既存accepted_additionsとvalidatorを使う。全対象UUID・本文hash・Role・scope・Citation／Source・依存、元判断と既存baseの不変、歴史receiptのcanonical file hashを検証し、採用receiptの完全な和集合とreleaseの追加集合が一致することを必須とする。releaseを再生成・上書きせず、元のdata／manifestをbyte同一コピーする。

出力にはrelease、移植用evidence、publication.json、全追加Claimのverification-cases.json、運営者scriptと互換schema、runbook、SHA256SUMSを含める。receipt集合の増加・根拠hashの変化・既存出力の上書きは拒否し、失敗したstaging directoryは公開bundleへrenameしない。Workerのロック・state・設定を変更しない。

```bash
python3 scripts/prepare-publication-bundle.py \
  --runtime WORKER_RUNTIME --release VERIFIED_CUMULATIVE_RELEASE \
  --register ORIGINAL_REGISTER --register-sha ORIGINAL_BYTE_SHA256 \
  --public-backup VALIDATED_PUBLIC_BACKUP --output NEW_PRIVATE_BUNDLE
```

Worker実行中は独立した読み取り調査を進め、変更・検証用の共通holdは既存休憩中に短時間だけ使う。待機中に保持しない。候補・planの最終検証は採用receiptが確定してから行う。途中候補は部分候補と明記し、正常実行中のWorkerのbaseを公開で変えない。

VPSの現行operatorは古いRole列挙でORIGINAL_STORYを拒否する。既存operator image config `b0e0bc42…`と、Role列挙だけを1項目増やす読み取りmountの組合せを検証する。Webは対応済みで、image／Compose／Webを切り替える必要はない。imageが違えばrunbookのpreflightは停止する。

`publication-backup-plan.ts`は既存のbackup validator・Graph差分・retained identity検査を使うが、DBへ接続しない。backup時点のbase／revision・history・identity・全差分の検証であり、VPSの最新実planとは表示しない。最終のVPS実planは運営者のsudo preflightが必須。ローカル実planとVPSのrevisionは別物として記録する。

結果は[2026-10-20の検証記録](../verification/PUBLICATION_PREPARATION_20261020.md)へまとめる。公開後のAPI検査scriptは名前・Graph・Role／scope・Citation／Source・revisionを検証し、実画面の手動確認を置き換えない。

## 既存runtimeからの固定

Node 24と既存依存を使い、Workerの休憩中に短時間の共通holdを取り、作業後すぐ解放する。以下のRELEASEは採用する全receiptを被覆した実在ID、OUTPUTはruntime外の新規directoryとする。元runtime・receipt・approval registerを変更しない。

```bash
python3 scripts/prepare-publication-bundle.py \
  --runtime "$WORKER_HOME/runtime" --release "$RELEASE" \
  --register "$WORKER_HOME/migration/approval-register-source.json" \
  --register-sha 82b53f2bb1e0c1e5402af117a22de2a809ecf0588a56743e6aaef3258b42e8d6 \
  --public-backup "$VALIDATED_PUBLIC_BACKUP" --output "$OUTPUT"
```

元40 Claimの正式receipt集合とIssue #25の元registerだけを許可する。未承認・保留・無関係な追加receiptは混ぜず、採用receiptの欠落、過去本文の変更、固定途中のreceipt／観測backup変化を拒否する。既存のscope未指定もそのまま保持し、ISBN等を補完する意味判断をしない。最終bundleには元release、明示decision・receipt・根拠hash、全追加Claimの検証ケース、運営者script、Role互換fileを含め、SHA256SUMSで固定する。

2026-10-20の実VPS preflightで、profile未指定の`compose config`が`ops`を返さず停止した。共通コマンドで`--profile ops`を明示し、実Compose／既存production定義を使うdaemon不要の回帰試験を追加した。[修正・再配置記録](../verification/PUBLICATION_PREFLIGHT_PROFILE_FIX_20261020.md)を参照。旧資材を保持し、データが同一の`-r2`へ再配置する。

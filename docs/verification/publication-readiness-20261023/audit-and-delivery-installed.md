# 監査実送信の完了・承認後配送の無効配置（2026-10-23）

## 実機で確認したこと

運営者が同じ固定診断を再実行し、auditUid992 / home一致 / credentialあり、GET exit0、POST exit0、1回目sent=true/deduplicated=false、2回目sent=true/deduplicated=trueを確認。PAT値やpasswordは受領していない。

GitHub APIでmarkerを独立検索し、[監査コメント6357557746](https://github.com/isinxnisi/graph-knowledge/issues/33#issuecomment-6357557746)が**1件だけ**存在し、nonce/base/revision/image/receipt集合/live planが一致。続けて既存readiness-client auditからもdeduplicated=trueを確認した。既存cleanupを実行し、temporarySudoRemoved=true / journalsPreserved=true。本番false/apply0。撤去後の同入口statusはsudo拒否になった。専用DB試験を繰り返さず、frozen/jobs/予約/鍵/過去承認を保全した。

source **35688b46d7e19a082b5572a57c6d7c2496a653d4** をcommit・通常push後、git archive（48,992,896 bytes / SHA **42c3cfaef80ab7f6c54ba108f78713bff6b1a31853ab61d98820882a169c3539**）とinstaller/metadataの全SHAをroot-private stageへコピーし照合。WSLへ**無効状態**で配置した。保全先 `/root/plunode-publication-delivery.0j6x3w6x`。

root self-checkはapprover公開pin一致、root→実UID1000の固定子起動、inactive configとqueueを確認。**signed=false / applyCalls=0**。normal userのqueue入口もdelivery-disabledで終了。署名鍵はroot専用のまま、scheduler/配送主体へ渡していない。

追加は `/etc/plunode-publication/delivery.json`（false）、delivery-coordinator.json（旧設定の固定copy）、approver-public.pem、`/usr/local/sbin/plunode-publication-approve`。旧coordinator/client/秘密鍵/Workerは変更しない。通常UIDの専用queueは空。追加file SHAと全配置情報は [installation JSON](delivery-installed-disabled.json) / [固定asset metadata](delivery-deployment.json)に記録した。

固定コードを使い、実際のroot→runuser/UID1000・制限された環境変数から、既存制御branchを別Git cacheで読取り、**変更なしpush --dry-run**の認証が成功。revision2/pauseMode=null。controlの追加・stateの直接変更・実Workerの停止/起動はない。Worker config d3411e…、正式receipt10、activeAttemptなし、公開API revision88437056…を再確認した。

## 検証と未確認範囲

- 配送11件成功：実署名/実Git/CAS/既存gateとファイル仮想KGで、署名受渡し・固定job登録・再開・二重apply防止・別control保全・未署名skip・symlink/nonce改変拒否を確認。実DB/Docker/本番鍵を使用しない。
- Windows taskは構文解析と**実CIMオブジェクト生成だけ**を行い、disabled=true、Limited、Interactive、IgnoreNew、logon+5分trigger、30分上限、固定wsl.exe→UID1000→root-owned Python --queueを確認。taskは未登録・未有効化。
- VPSの有効化helperを準備。program manifest68881f…/全program SHA/image/config binding/一時sudo撤去/全readiness ticket finished/予約空/最新baseを再照合し、共通lock下でdeploymentEnabledの一フィールドだけを変更する。旧configとroot stageを保全。承認・外部custodyの明示flagがなければ拒否。metadata保存失敗はlock保持中に同configを戻す。使捨てroot FS＋仮のimage/observeで4件成功（成功→hash限定disable、保存失敗、custody/ticket未完、code改変拒否）。最初は/tmpの親1777が正しく拒否されたので、root-private使捨てfixtureへ修正。実VPSでは**まだ実行していない**。

正式データの署名→本番apply一巡は個別承認前なので未実施。今回の結果を#33完成や本番有効化済みと扱わない。

## 次の承認対象と条件

[固定手順と復旧](../../runbooks/PUBLICATION_APPROVAL_DELIVERY.md)のとおり、(1)VPS deploymentEnabled false→true、(2)WSL deliveryEnabled false→true、(3)専用Windows taskの登録と有効化を一括の**本番有効化承認**として提示する。Windows taskは従来readiness範囲外であり、暗黙には登録しない。新たなVPSユーザー/SSH/秘密鍵/sudoers/サービスや、実data applyは含めない。

暗号化custody-vps.gpg / custody-wsl.gpgのPC/VPS外保管・SHA一致・phrase別保管は引き続き運営者確認待ち。確認・有効化承認が揃うまで全flagをfalseに保つ。有効化後も正式未公開1 Claimの固定release公開承認は別に必要で、既公開50 Claimは再公開しない。

切戻しは専用task disable→WSL false→VPS共通lockの安全な地点で既知enabled config SHAを指定してfalseへ戻す。実行中処理の強制終了・lock削除・DB restore・nonce/ticket削除・未確認pause解除はしない。

今回の作業はopsと文書であり、3200/beta/VPS Webの再buildは行わない。共有mainの別作業・memo.txtへ介入せず、独立branchを通常pushする。b845dd8の既存main統合済み状態は維持。

# 公開承認からの配送・同nonce再開

Issue #33。既存のPUBLICATION_ENABLEMENT_READINESS / PUBLICATION_COORDINATION / PUBLICATION_GATE_INSTALLATIONを利用する。公開機構の**有効化承認**と、各固定releaseの**データ公開承認**は別である。正式未公開1 Claimはまだ公開承認していない。

## 今回の配置範囲

固定WSL snapshotへ既存CLIとpublication-delivery.pyを配置し、root所有の `/etc/plunode-publication/delivery.json`（deliveryEnabled=false）、同delivery-coordinator.json（既存coordinatorの固定copy）、approver-public.pem、rootの `/usr/local/sbin/plunode-publication-approve` を追加する。既存秘密鍵・client・Worker config/state/cache/control/scheduleは変更しない。root署名鍵は `/root/plunode-publication-operator/approver.pem` のまま。

専用queueは既存UID1000の `~/.local/share/plunode-publication/deliveries`（0700）。queue作成もUID1000で行い、rootがuser-owned親へ成果を書かない。rootは固定codeの子をrunuserでUID1000へ落として起動する。root専用sudoersを増やさず、運営者の既存sudo認証だけを使う。

installerは固定archive SHA・rootの親・既存client/coordinator SHA・Worker973c7b0/ID/remote/branch/runtime/common lock/closure pin・既存approver鍵pairを検査し、公開コードを明示644で抽出する。既存target/configがあれば上書きせず停止する。root self-checkは**署名せず**鍵pairと実UID1000の子・inactive config・queueを確認する。失敗時はroot stageを保全し、旧installerを繰り返さない。

## 有効化の承認対象（まだ実行しない）

1. VPS：固定root program manifest68881f… / source0732af9、image367e9c…、鍵pin・公開base/revision88437056…・予約空・全readiness ticket finished・一時sudo撤去を再確認。共通lockをnonblockingで取得し、旧trusted/config.jsonをroot-privateに保全して **deploymentEnabledだけfalse→true**。code/image/DB/サービス/ユーザー/SSHの変更は含めない。
2. WSL：固定source・自己診断・queueに署名済み未完了jobなしを確認し、root-owned delivery.jsonの **deliveryEnabledだけfalse→true**。Workerは変更しない。
3. Windows：`Plunode-Publication-Delivery` という新規専用taskだけを登録し有効化する。登録scriptは必ず**disabledで作成**し、同名taskがあれば上書き拒否。current Windows user / Interactive / Limited、WSLのUID1000、root-owned固定Pythonだけを実行。5分おきとログオン時、IgnoreNew、30分上限、Hidden。Codex/AIを呼ばず、常駐processを追加しない。既存Worker/自動開発taskを変更しない。これは従来の一時readiness範囲にないため、本番有効化と一緒に明示して承認対象とする。

PC停止/ログアウト中は配送を実行できない。次のログオン/予定起動で同nonceを再開する。VPSの永続ticketとGitのpause-newはtimeoutで解除しないため、PC不在中も受入と公開が競合しない。実行中Workerの強制終了・lock強制解除は行わない。

**有効化だけでdata applyはしない。** queueに人間の固定署名がない場合、定期入口はremoteにも接続せず終了する。登録済みだがdisabledのtaskを有効化済みと報告しない。root config falseの段階ではqueue/approval入口も通信・署名せず終了/拒否する。

## 公開候補の準備と唯一の運営者公開承認

候補は従来の棚卸し/公開CLIで、正式receipt・最新公開backup/revisionから用意する。SFTP転送→arm→運用判断に結び付くpause-new→通常Worker ACK→固定peer preflightまでは既存手順を使う。候補準備は公開承認と区別する。無承認のpause、承認待ち中の共通lock保持、旧offline plan hashへの差替えをしない。

peer CLIには既存の利用者所有0600 coordinator.jsonを渡す。配送adapterは、それがroot-owned delivery-coordinator.jsonと完全一致することを毎回検証し、不一致・symlink・mode違反なら停止する。peerのowner検査を弱めたり、旧設定の所有者を変更したりしない。

root preflightのlive requestが確定したら、UID1000の固定delivery CLIに `--register --candidate ABSOLUTE_PATH --nonce UUID --human-decision PATH` を渡す。登録先は固定queue/UUID/job.json。root request/ticket、ローカルcandidate/正式receipt、既存pause journalが一致しなければ拒否。同じjob IDを別内容で上書きしない。登録だけでは署名・applyしない。

運営者は差分・根拠・Role/scope/依存関係・既存更新0・base/revision・receipt集合・image/artifact/live plan SHA・nonceを確認してから、ローカルWSLで一度だけ実行する：

```bash
sudo /usr/local/sbin/plunode-publication-approve --nonce UUID --minutes 30 --operator-approved
```

root入口は固定UID1000の子でVPSの未消費live requestを再読取し、画面に固定requestを表示する。運営者がそのrelease IDを端末へ入力した場合だけ、既存publication-sign.py/別approver鍵で署名する。署名はpipeでUID1000の配送入口に渡し、同jobに一致する署名だけをdurable保存する。rootが利用者directoryへ署名fileを書かず、秘密鍵を子やschedulerへ渡さない。署名保存後は転送・execute・close/resume/finish・通知まで**追加のVPS操作やCodexは不要**。

## 自動処理と失敗後の位置

- 各起動でroot statusを再読取し、nonce/request/ticket/candidateの同一性を確認する。ローカル進捗だけでapplyの成否を決めない。
- 未消費時は署名転送→既存peer execute。rootが署名有効期限・最新receipt・base/revision・planを再照合する。期限切れ未消費は停止し、人間の判断へ戻す。
- 消費済みだが応答不明なら同nonce executeの既存**verify-only**へ戻る。別nonce/自動restore/再applyを作らない。検証不能ならpauseを維持する。
- completed確認後だけclose→署名閉鎖検証→自分のpauseに対するCAS resume→finish。別運用controlが続いた場合は勝手に解除しない。
- rootがfinishedならexecute/close/resumeを繰り返さずnotifyだけ。通知失敗時は次の予定でstatus/notifyだけを再試行する。
- 署名受渡し前のPC停止は公開承認を保存できていないため自動実行しない。署名をdurable保存した後の停止はqueueから再開する。共有Worker/common lockを転送・通知・次回待ち中に保持しない。

## 復旧・無効化

新規起動を止める場合は専用Windows taskをdisableし、root-owned WSL deliveryEnabledをfalseへ戻す。既存Worker/自動開発taskは触らない。稼働中配送を強制終了せず、VPS共通lockが取れる安全な地点でdeploymentEnabledをfalseへ戻す。KG/receipt/予約/ticket/journal/署名は保全する。

適用結果が不明な場合、queueを削除したり、別nonceでやり直したり、DBを自動restoreしない。公開gateが無効だとclose/finishも使えないため、原記録を確認して必要な同nonce復旧だけを再許可する。VPS閉鎖証明を確認するまではWorkerの自分のpauseを解除しない。

追加WSLコードだけを撤去する場合もconfigはfalse、署名済みpending jobなしを確認し、installation.jsonの追加4 fileについて現SHAが一致するものだけを削除する。元coordinator/client/秘密鍵/Workerは削除しない。snapshot/installation.json/暗号化backupは証跡として残す。taskがあれば専用taskのaction/source/owner一致を確認してそのtaskだけを撤去する。

## 確認範囲

監査専用UIDによる実POSTとdeduplicationは2026-10-23に成功し、GitHub markerは1件。一時readiness sudo撤去とその後の拒否も確認した。新配送接続はファイル仮想KG・実署名/Git/CAS/gateの11件を検証。専用実DBのapply/復旧は完了済みで繰り返さない。Windows taskは実CIM定義まで検証したが、登録・有効化はまだ行っていない。正式データの署名→本番apply一巡は個別承認前なので未実施である。

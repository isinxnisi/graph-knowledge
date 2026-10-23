# 公開承認からの配送・同nonce再開

Issue #33。既存のPUBLICATION_ENABLEMENT_READINESS / PUBLICATION_COORDINATION / PUBLICATION_GATE_INSTALLATIONを利用する。公開機構の**有効化承認**と、各固定releaseの**データ公開承認**は別である。正式未公開1 Claimはまだ公開承認していない。

## 2026-10-24：正式受入後の候補自動準備（現行）

以下の節に残るdisabled／未公開1件／手動候補準備は導入時の履歴。現行は51 Claim公開済み・正式未公開0件。公開承認後の定期配送は676284f、GUI起動は47196c8で実配置・確認済み。今回の候補準備を同じ定期入口へ接続する。VPSゲート・鍵・ops image・Worker・そのtaskは更新しない。

`publication-delivery.py --queue` は署名済み未完了jobを最優先する。なければroot-owned delivery.jsonのpreparation.enabledに従い `publication-preparation.py` を1 step実行する。Windowsの既存5分周期＋ログオン時、GUIから非表示起動、IgnoreNew、30分上限を維持し、新しいtask／常駐service／有料AIは追加しない。

1. 公開API revisionに一致するcompleted deliveryを一意に選ぶ。VPS固定statusのcompleted／finished／全graph検証data SHA・raw manifest SHAと、固定applied artifact・requestを照合する。API部分射影だけを完全backupと呼ばない。未知のrevision／欠落・改変した旧成果は停止する。
2. 対応する公開releaseをWorker runtimeへ**存在しなければ同一bytesで追加**。既存同名は完全一致だけを許容。既存receipt・旧release・state・cache・コードを変更しない。Worker/common barrierはこの短い追加・確認時だけ取得する。
3. Inventory.formal_receipts、publication-cycle.partition、receipt_projectionの既存hash／依存関係検証を使う。公開済みIDは除外し、元receiptの削除・差替え、本文／Role／scope／Source／Citation競合を拒否。未承認・未受入データは混入させない。
4. 新nonce／base／receipt集合をintentへfsync保存してから候補を凍結する。既存publication-cycleのbuilderと、固定ローカルops imageによるvalidate／オフライン差分planを再利用。imageはnetwork=none、read-only、非root、公開データ専用mount。稼働中runtimeのPythonをimportせずroot所有の固定snapshotを実行する。従来CLIの「最新backup必須」検査は維持し、自動経路のapplied-artifact観測と区別する。
5. SFTP転送→既存arm→承認済み運用判断のpause-new→**通常WorkerのACK待ち**→固定peerによるVPS最新backup／revision／実plan→未署名job登録。受入を直接起動せず時間帯・休憩・通常tickを尊重する。人間承認待ちはlockを保持しないが、固定receipt集合を守るpause-newは残す。
6. 既存制御branch `codex/collection-control` の [publication-ready](https://github.com/isinxnisi/graph-knowledge/tree/codex/collection-control/collection-control/publication-ready) にcurrent.jsonと不変のnonce別README.md／request.json／review.jsonを記録する。reviewには追加本文・Role/scope・Source/Citation・依存Entityを機械的に転記。人間は差分・根拠と固定requestを確認し、READMEのWSL承認コマンドを実行してrelease IDを入力する。この署名だけが本番applyを許可する。
7. 署名後の転送→単回apply／verify-only→close→自分のpauseだけCAS resume→finish→監査は既存配送処理が行う。次回は新しいcompleted artifact／revisionをbaseに再棚卸しする。

### 停止・再開と復旧

- PC停止／ログアウト／通信障害は次の通常起動でintentの**同nonce・同candidate**を再開する。転送、arm応答喪失、実plan、登録後のGit記録失敗は同じ位置から再試行。自動で署名・有効期限更新・apply承認しない。
- Worker/common lockがbusyなら変更せず次回へ。自分のpreparation.lockは一起動だけ保持し、Worker/common lockは通信・承認待ち・次回待ち中に持たない。実peerの既存30秒取得待ちは部分取得を全解放して待つ。
- arm前に新receiptが増えたら旧未登録intentを退役し、次回に新集合で準備する。arm後・未登録で増えた場合は同nonceを署名cancel→自分のCAS resume→finishできた後だけ退役する。取消し／resume／finish応答喪失後も同nonceを再確認し、再pauseしない。
- 登録済み承認待ちのreceipt集合変更、旧receipt／根拠改変、未知の公開revision、別control割込みは安全停止し、固定jobとpauseを保全する。これらの実不整合は人間判断へ戻す。無条件resume、別nonceによる結果不明apply、ロック削除はしない。
- ローカル `~/.local/share/plunode-publication/preparation/health.json` にup-to-date／waiting-local-lock／waiting-worker-acknowledgement／awaiting-human-publication-approval／preparation-stoppedを記録。Windows last-run.jsonとSchedulerのexitで定期入口も確認できる。Git記録だけ失敗した場合も次の予定で同じ不変ready記録を送る。
- prepared候補を止める場合は**新規準備だけ**preparation.enabled=false。署名済み既存jobの配送は維持。全面停止・未知applyは既存の復旧節を使う。既にarmしたticket／pauseをconfig変更だけで解除しない。
- 固定コードの切戻しはroot stageのdelivery.before.jsonと専用taskの旧SourceCommit ActionをReady地点で戻す。候補・receipt・jobs・nonce・journalを削除しない。旧版には候補自動準備がないが、既存署名済み配送は維持される。

公開候補準備・協調の自動実行は運営者の今回の指示に基づく運用承認であり、個別データの公開承認ではない。無入力の定期処理にapprover秘密鍵を渡さない。正式未公開0件ならarm／pause／新job／applyを作らず、最新baseとの棚卸しのみで終了する。

## 今回の配置範囲

固定WSL snapshotへ既存CLIとpublication-delivery.pyを配置し、root所有の `/etc/plunode-publication/delivery.json`（deliveryEnabled=false）、同delivery-coordinator.json（既存coordinatorの固定copy）、approver-public.pem、rootの `/usr/local/sbin/plunode-publication-approve` を追加する。既存秘密鍵・client・Worker config/state/cache/control/scheduleは変更しない。root署名鍵は `/root/plunode-publication-operator/approver.pem` のまま。

専用queueは既存UID1000の `~/.local/share/plunode-publication/deliveries`（0700）。queue作成もUID1000で行い、rootがuser-owned親へ成果を書かない。rootは固定codeの子をrunuserでUID1000へ落として起動する。root専用sudoersを増やさず、運営者の既存sudo認証だけを使う。

installerは固定archive SHA・rootの親・既存client/coordinator SHA・Worker973c7b0/ID/remote/branch/runtime/common lock/closure pin・既存approver鍵pairを検査し、公開コードを明示644で抽出する。既存target/configがあれば上書きせず停止する。root self-checkは**署名せず**鍵pairと実UID1000の子・inactive config・queueを確認する。失敗時はroot stageを保全し、旧installerを繰り返さない。

## 有効化の承認対象（まだ実行しない）

1. VPS：固定root program manifest68881f… / source0732af9、image367e9c…、鍵pin・公開base/revision88437056…・予約空・全readiness ticket finished・一時sudo撤去を再確認。共通lockをnonblockingで取得し、旧trusted/config.jsonをroot-privateに保全して **deploymentEnabledだけfalse→true**。code/image/DB/サービス/ユーザー/SSHの変更は含めない。
2. WSL：固定source・自己診断・queueに署名済み未完了jobなしを確認し、root-owned delivery.jsonの **deliveryEnabledだけfalse→true**。Workerは変更しない。
3. Windows：`Plunode-Publication-Delivery` という新規専用taskだけを登録し有効化する。登録scriptは必ず**disabledで作成**し、同名taskがあれば上書き拒否。current Windows user / Interactive / Limited、WSLのUID1000、root-owned固定Pythonだけを実行。5分おきとログオン時、IgnoreNew、30分上限、Hidden。 WindowsのHiddenはtask一覧用でありconsole非表示ではない。専用GUIホストwscript.exe //B //NoLogoからpublication-delivery-launcher.wsfを起動し、固定WSL queueをwindow style=0で生成・同期waitする。子の終了codeをtaskへ返す。ラッパーは非仮想化の%USERPROFILE%\plunode-publication-deliveryへ配置し、直近のsource/開始・終了/exitをlast-run.jsonへ記録する。Codex/AIを呼ばず、常駐processを追加しない。既存Worker/自動開発taskを変更しない。これは従来の一時readiness範囲にないため、本番有効化と一緒に明示して承認対象とする。

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
- 署名受渡し前のPC停止は公開承認を保存できていないため自動実行しない。署名をdurable保存した後の停止はqueueから再開する。共有Worker/common lockを転送・通知・次回待ち中に保持しない。 固定peerの取得時だけ通常Worker tickの競合を最大30秒待つ。取得はすべてnonblockingで、失敗した部分取得を全解放してから0.25秒以下の間隔で再試行する。challengeは取得後に受信するため、有効期限を延長しない。30秒を超える競合や取得以外の不整合は停止し、次回予定で同nonceを再確認する。

## 復旧・無効化

新規起動を止める場合は専用Windows taskをdisableし、root-owned WSL deliveryEnabledをfalseへ戻す。既存Worker/自動開発taskは触らない。稼働中配送を強制終了せず、VPS共通lockが取れる安全な地点でdeploymentEnabledをfalseへ戻す。KG/receipt/予約/ticket/journal/署名は保全する。

適用結果が不明な場合、queueを削除したり、別nonceでやり直したり、DBを自動restoreしない。公開gateが無効だとclose/finishも使えないため、原記録を確認して必要な同nonce復旧だけを再許可する。VPS閉鎖証明を確認するまではWorkerの自分のpauseを解除しない。

追加WSLコードだけを撤去する場合もconfigはfalse、署名済みpending jobなしを確認し、installation.jsonの追加4 fileについて現SHAが一致するものだけを削除する。元coordinator/client/秘密鍵/Workerは削除しない。snapshot/installation.json/暗号化backupは証跡として残す。taskがあれば専用taskのaction/source/owner一致を確認してそのtaskだけを撤去する。

## 確認範囲

監査専用UIDによる実POSTとdeduplicationは2026-10-23に成功し、GitHub markerは1件。一時readiness sudo撤去とその後の拒否も確認した。新配送接続はファイル仮想KG・実署名/Git/CAS/gateの11件を検証。専用実DBのapply/復旧は完了済みで繰り返さない。Windows taskは実CIM定義まで検証したが、登録・有効化はまだ行っていない。正式データの署名→本番apply一巡は個別承認前なので未実施である。

既存の公開配送taskを直接wsl起動から直す場合は、登録scriptの`-UpdateExisting -SourceCommit FIXED_SHA`を使う。自身の固定actionだけを受理し、Running時は止めず待つ。Actionだけを更新し、enabled状態・trigger時刻・Principal・IgnoreNew・30分上限を維持する。CollectionWorker/Autopilotには操作しない。旧XMLを保全し、必要なら公開配送の旧Actionだけへ戻す。GUIラッパーは署名・公開処理に介入せず、WSLの同nonce復旧経路をそのまま使う。

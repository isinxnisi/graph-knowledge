# Issue #33 本番導入前の実環境確認（2026-10-21 JST）

現在：**本番導入済み・公開無効を維持／専用DB故障試験は部分完了、verifier更新後の内部エラーを診断待ち**。以降の導入前記録は当時の観測として残す。[確定差分・影響・復旧・一括承認対象](../runbooks/PUBLICATION_ROLLOUT_20261021.md)。既存PUBLICATION_GATE_INSTALLATION/PUBLICATION_COORDINATIONを使用し、公開済み50 Claimを再公開しない。

| 項目 | 実測 |
| --- | --- |
| 本番API | https://plunode.net/api/dataset は200、public-kg、revision `88437056-b74f-42ab-88c0-33ed435bdccc` |
| VPS | Ubuntu24.04、x86_64、RAM3909MiB・available約2159MiB、swap2047MiB未使用、/空き約168GiB（観測時点） |
| 既存SSH | develop UID1000、groups develop/sudo/users。既知host keyをStrictHostKeyChecking=yesで検証して接続。秘密鍵/パスワード出力なし |
| 実権限 | `sudo -n -l`はパスワード必須。Docker client29.1.3、socket root:docker0660、developはDockerアクセス不可。rootのCompose/image/全lock状態は未確認 |
| 既存サービス | docker/containerd/ssh/caddy/resale-ebay-notificationsがactive。既存monitor timerも稼働。変更・reload・停止なし |
| VPS現行ファイル | /opt/graph-knowledge root0755、app.env/compose.yaml/共通lockはroot0600。env本文や秘密情報は読んでいない |
| 導入先 | /usr/local/sbin/plunode-publication、/usr/local/lib/plunode-publication、/var/lib/plunode-publicationなし。publish/upload/audit専用accountなし |
| SSH設定 | 新規drop-inなし。現global設定は維持する。新accountだけのMatch追加案を提示。既存認証方針の一律変更を行わない |
| WSL Worker | home末尾phase-b-20261020、code973c7b0、plunode-wsl、制御branch codex/collection-control。control revision2、pauseなし、activeAttempt/errorなし。通常のworker.lock保持を観測し、終了/強制解除なし |
| Windows定期処理 | Plunode-CollectionWorkerは毎分起動、直近終了0。Autopilot taskはdisabled/直近終了0。いずれも設定変更なし |
| 正式receipt | 元9件、集合SHA256 `b9718eb62c705b360852fab0b6adbbac932cbff094656ad96879ff2018a101f1`。既存記録は不変更 |
| WSL filesystem/権限 | runtimeとhomeはext4。sudo -nは認証必須。承認後の固定bundle配置にはWindows側からの明示root起動を使用可能 |
| reviewed code | gate/SSH/policy/cycle/sign/attest/coordination等11ファイルは72338b7のGit blobと全一致 |
| ops image | ローカルにaf1216c9…が存在、linux/amd64、771372598 bytes。再buildせずID指定で単一untagged archiveへexportした |

共有mainの初回確認はad79a57。その後、別手動作業の共通lockを尊重し読み取りだけ継続した。解放後、短時間holdの下でe64a2deから独立worktreeを作成した。別作業成果と既存memoを維持。稼働Worker/共通lockを強制解除していない。

VPS/WSLのユーザー、権限、SSH、鍵、サービス、DB、公開applyは**未変更**。rootの実Docker/SSH/sudo連携、専用DBでの実機故障試験はまだ実施していない。betaのAPIは今回HTTPエラーだったが、UI/Web変更のない本タスクでは反映作業やサービス再起動を行わない。正式APIの200と混同しない。

現時点の区別：本番導入済み＝いいえ、公開経路の実機検証済み＝いいえ、本番有効化済み＝いいえ、運営者判断待ち＝上記一括承認とVPSでのsudo認証。installerには本番有効化やapply呼出しを含めない。承認後に導入・実機確認を進め、結果を追記する。

新しいone-time installerの構文検査と非特権境界3試験（非root/余計な引数でsystem commandを呼ばない、既存file/symlinkを上書きしない・mode固定、user-writable stagingを拒否）は成功。rootとしての配置・visudo/sshd/Docker操作は承認前のため未実行。ゲート本体は不変更であり、既存156試験をこの段階で再実装・反復していない。

既存publication-cycle syncを、Worker既設Node24をPATH先頭へ指定して本番APIに対しread-only再実行した。up-to-date、正式受入済み公開50 Claim（66 Entity/43 Source/51 Citation）、未公開全型0、productionExecutionEnabled=false。出力はGit外private cache。mainの正式receipt3件はruntime9件内の同一hashと一致し、観測時点で追加のmain-only正式receiptなし。初回は通常PATHの旧Nodeが--importを受け付けず停止し、環境選択だけ修正して再確認した。

別工程で新しい正式receiptが保存された場合には、この0件という観測を有効化判断へ流用しない。mainとruntime双方の記録を読み直し、公開候補・receipt集合・最新base/revisionとattesterの参照元を再確認する。今回の導入承認は新Claimの本番applyを許可しない。

導入前にVPS既設sshdのパーサーへ設定候補をstdinで渡すread-only確認を追加。PermitUserEnvironmentはMatch内で使えないため、候補をPermitUserRC noへ修正し、環境変数取り込みは既存globalのpermituserenvironment noをroot preflightで確認する。既存globalを変更して補うことはしない。秘密host keyを読めない非root構文検査と、承認後のroot sshd -t/実効設定検査を区別する。

修正候補を再度VPS実パーサーへ渡した結果、Match directiveのエラーは解消し、非rootでは読めないhost key不足で停止した。rootによる最終構文/権限検証は引き続き承認後のゲートとする。installer失敗時の診断はroot-private stagingへoperation/error type/reasonのみ0600で残し、env/stdin/子process出力を保存しない。

導入時umask077の下でも公開入口・home/chroot・privateディレクトリのmodeを明示適用する検査を追加し、非特権境界試験は計4件成功。これは実rootとしてのユーザー作成・SSH reloadの完了を意味しない。


## 一括承認後の実行経過と現在の再開点

運営者は「導入・実機試験を一括承認（本番は無効を維持）」を選択済み。WSLへroot-ownedの固定repo 72338b7と固定SSH clientを配置し、専用SSH/attester鍵を作成した。approver秘密鍵はWSL root0600へ分離し、自動実行UIDから読めないことを確認した。固定repo 1,543項目の所有/非group-write/非symlink、不正client要求3件の拒否を確認。秘密鍵は転送資材に含めない。

VPSのroot実行は、旧installerが2回ops profile欠落で停止し、修正版がimage inspectで停止した。前2件はaccount/dir/image load前、3件目は専用image load後・account/公開root/SSH配置前であった。原失敗記録とroot-private stageは保全している。VPSのimage storeはcontainerd、同じarchiveのmanifest ID e48a5409…が参照可能で、config ID af1216c9…は参照不可と実確認した。対応は[一括runbook](../runbooks/PUBLICATION_ROLLOUT_20261021.md)に記載。

実行結果待ちの最新再開入口は `resume-store-and-realtest-v2.py`、SHA256 `97a7610cb88f9dc5ba93ed0dea8189080976fbee3b9bf8c1234a96c6828b7574`。public-only試験資材archive SHAは `c32a88e102e55a5bde7edea45e85704263c275604a310ba087dcd06c4b677bf2`。VPS転送後のSHAを照合し、root-privateで検証して実行するコマンドを運営者へ提示している。旧P33_STORE_FIXEDを既に実行した場合は新入口を重ねず、結果を保全して個別の再開点を確認する。

対象Python15件と、ローカルprivate Neo4jの空base→2 Claim適用/2 receiptの完全observeは成功し、試験container/networkは除去した。**VPSの導入成功、実sshd/sudoによる拒否試験、VPS専用DBでの公開/通信断/復旧試験、本番有効化は未確認・未完了**。現在の再開に追加の導入承認は不要であり、必要なのは運営者端末でのsudo実行結果である。本番有効化は今回の承認範囲に含まれない。

最終WSL読取時の既存9 receipt集合SHAは b9718eb62c705b360852fab0b6adbbac932cbff094656ad96879ff2018a101f1、Worker config SHAは d3411e24937f2f422495bf347bac9361b5a6364375443d104c266f96de4763e9、control revision 2/pauseMode null/activeAttemptなしを維持。本番KG revision 88437056-b74f-42ab-88c0-33ed435bdcccも維持。稼働Worker/Git制御/時間帯/休憩/Windows task/会員DB/Webへ変更していない。共有反映のholdは短時間だけ取得し、待機中は解放する。


## v2実行後：本番導入完了と専用DB試験の停止位置

運営者のP33_READY_V2実行結果で、`/root/plunode-publication-install.o7810vn8` に **installed-disabled** が保存された。sourceCommitは72338b7054b3f2eb2e9762b20859044f9b9e28ce、実operatorDigestはcontainerd storeの `sha256:e48a540914d708a88a70b66ad399eb6a7769e98c76ff4ace50cdb7febdf04cf1`。同archiveのconfig ID af1216c9…とのmanifest/config/全layer対応を検証している。`deploymentEnabled:false`、本番applyCalls 0、公開revisionは88437056-b74f-42ab-88c0-33ed435bdcccのまま。本番installerは再実行しない。

| 実機確認 | 結果 |
| --- | --- |
| VPS固定9ファイル | reviewed manifestのSHAと全一致。ファイル・親経路ともroot所有、非group/other-write、非symlink |
| SSH専用鍵と制限 | 実行/uploadの公開鍵binding一致。不正shell・余計な引数・不正UUIDを拒否。TCP forwardingをadministratively prohibitedで拒否 |
| disabled入口 | 正しいstatus UUIDもdisabled gateで拒否。公開依頼・nonce・本番applyを作らない |
| upload chroot | 専用鍵でSFTP接続成功。trusted/configと../../etc/passwdへのアクセス拒否 |
| 既存SSH | 元sshd_configのbytes/SHAを維持した末尾Include。旧config SHAは71445bebceb23ed2da607538aa99f3bbc1ab84e10b4a5f4d04c541e48899d7f9 |
| 公開KG読取backup | WSLのGit外0600へ受領。SHA256 750850776e2824b7e1eb20a3fc73db56e41dc188f71cfba214290741dd7071ab。既存TS validatorでchecksum/schema/完全graph/5 DB receiptsを検証し、公開済み固定fixtureと全レコードの値が一致 |
| 公開KG全体 | 2,175 Entity / 1,894 Claim / 1,794 Source / 1,931 Citation、graphDigest 1779d6c18e8be07cf3bd6fcac1b1d15f12b4fb74b8f9933b33bfbabf5c6a4bc7。今回の既公開50 Claimはこの全体の一部である |
| WSL closure pin | root-owned `/etc/plunode-publication/exclusion.pem` とVPS側pinが一致。SHA256 2bc1efe6bcb1dc1b15850b7430043e47e8caec7ba557aecd644e3d473faeb06d |
| WSL coordinator設定 | 実Workerのhome/code/branch/ID/共通lockを参照するprivate設定を配置。coordinator実行・Git制御・pause/resumeは行わない |
| 他サービス | docker/containerd/caddy/ssh/resale-ebay-notificationsのactiveを維持。会員DB・本番KG・Web/Compose設定変更なし |

続く専用DB準備は `private-real-machine-setup-stopped` で停止した。公開用rootとtest rootは別であり、**本番導入の失敗とは扱わない**。専用SSH鍵を登録するより前の段階で、test backupとclosure公開鍵は生成済み、setup.jsonと試験用SSH認証は未成立。Web起動/loopback API確認付近を調査するため、Docker lifecycle/OOM/exitと非秘密のimage defaultsだけを読む診断を運営者へ提示した。現時点では具体的な停止原因を断定しない。

専用DBの実backupも既存TS validatorで検証成功した。release-group-2、revision65e482e4-c269-43e2-ae6a-edd02764d113、3 Entity / 2 Claim / 2 Source / 2 Citation、2 DB receipts。ファイルSHA256は1a239fffc0d083992c66fe679c08f71228696e3d67983c6104237df2dbbb6ac4。これによりVPSの空base→合成2 Claimの初期化までは確認できたが、公開ゲート経由の新Claim適用、通信断、適用後応答喪失からverify-only復旧、閉鎖→resume→finishの実機試験は未完了。

試験preparerには、失敗時に新規作成containerの構造状態（Status/OOMKilled/ExitCode、memory/pids、network名、要求/実公開port、health状態）を除去前に記録する最小変更を加えた。env・raw error・container logを出さない回帰試験を含む6試験が成功。これ自体を実VPS試験の成功とは扱わない。

次の再開は診断結果を確認した後の**試験準備部分だけ**とする。旧test root・nonce/reservation/jobの有無と、作成資材のID/label/所有を確かめ、証跡を保全する。本番installer/既公開50 Claimを再実行せず、未知のjournalを初期化しない。追加の導入承認は不要で、本番有効化・個別公開applyの承認はまだない。

現時点の区別：**本番導入済み＝はい（disabled）／実機検証済み＝SSH・root境界・読取backup・専用DB初期化まで／本番有効化済み＝いいえ／運営者操作待ち＝読み取り診断のsudo実行結果**。鍵の暗号化保管/rotation、audit認証・制御branch保護の確認、全故障試験と試験入口撤去、main/runtime両方の最新receipt棚卸しが有効化前に残る。並行するIssue #34で正式receiptが増えた場合は、新しい未公開件数を再確認し、過去の未公開0件という観測を流用しない。


## 並行する正式受入の更新を再確認

本番導入後、Issue #34の人間承認済み1 Claimが既存正式ワークフローで受け入れられた。新receiptは `datasets/manga-collection/accepted-issue-34-obata-drawing-20261021/acceptance.json`、SHA256 `7f62ec0f27d4fedfbb09066893d4ac94d88eaf016c2fff3959a001ea9f228efe`。記録時刻2026-10-20T17:52:45.754800+00:00、sourceReviewKind=saved-evidence-v1、追加0 Entity / 1 Claim / 1 Source / 1 Citation。本タスクによる新しい意味判断・受入・公開ではない。

配置済みroot-owned固定72338b7のworkflow/inventory/partitionを全runtime10 receiptへ読み取り専用で実行した。現集合SHA256は8a55413ee9fedf32fd64ce6fddebd28d1d636ff7de0fcc1fd063a5b15524d56dで、並行する正式受入側の独立検証結果とも一致。issuesは空、全readsetは検証前後で不変、公開済み受入分66 Entity / 50 Claim / 43 Source / 51 Citation、**正式受入済み未公開は0 Entity / 1 Claim / 1 Source / 1 Citation**。現公開backupのrelease/revisionをbaseとし、未公開Claim UUIDは7ae1c51b-9ba0-46fb-a070-41ac310e8c94。旧0件という観測は現在の公開判断へ利用しない。

この確認は既存hash-backed棚卸しの互換性検査であり、新candidateの完全attester経路・root live plan・固定署名承認・本番公開の完了ではない。本番gateはdisabledのままとし、新receiptを含む最新集合を公開時に改めて固定する。


## 読み取り診断後の専用試験準備v3

運営者の固定SHA付き診断結果は productionEnabled=false、testJobs=[]、testReservationsExist=false、testExclusionExists=false、testResourcesExist=false、testSudoersExist=false。Web imageの非秘密defaultはNODE_ENV=production / HOSTNAME=0.0.0.0 / PORT=3000。過去のDockerイベントは返らなかったため、旧停止のOOM/exit/port原因は確定できていない。空の状態を理由にnonceやjournalを初期化する処理は追加しない。

一時試験のAPI経路を、host publishの32740から、**internal bridge上の実WebのIPv4:3000へホストから接続する方式**へ改めた。本番の72338b7・API verifier・public-kg CLI・DB guardは不変更。偽APIや本番APIへ差し替えず、同じ実Web/専用DBに対して既存の全Claim検証を行う。Docker networkのID/名前/driver/internal/label、Web containerのID/image/label/唯一の所属network、IPv4/subnet/実endpointを照合し、公開portや追加networkを拒否する。新常駐service・external network・host networkのVPS試験containerは追加しない。

ローカル9試験が成功し、別network・container・image、公開port、loopback/範囲外IP、予約/協調状態・job/凍結資材/入荷が存在する場合の再開拒否を確認した。ローカルはDocker Desktopのため、WSLからbridge IPへの直接接続はtimeoutした。daemonのhost namespaceに置いた固定・無資格情報の一時probeから、internal network上のHTTP応答を実確認した。port公開は空、作成したlocal container/networkだけを除去した。これはVPSでの経路確認完了とは区別する。

一回用 `ops/resume-publication-acceptance.py` は、disabled本番config・固定core・既知の旧試験program SHA・元合成backup SHA・試験公開鍵・空のjob/frozen/inbox・予約/協調状態なし・試験sudo/SSH鍵未有効・旧container/networkなしを確認する。適合時だけ旧test treeと旧試験programをroot0700のtest-attempts/UUIDへrenameして保全し、新規試験を準備する。既存の予約や未知の資材があれば停止し、削除・再利用しない。本番installerは含まない。専用setup lockだけを使い、WSL/Worker/本番共通lockを待機中に保持しない。

public-only v3 archiveは15,045 bytes、SHA256 b60dbcf9a1ce63d8c569dc6bdbc2f6a8d9c4144ac66a9f44fb90707b8e11af08。bootstrap `resume-private-test-v3.py` のSHA256は65906a4c71304f23ad1614a07cdc6c1238c02d3190c61a45bcb7d17063d5a449。全11 fileのmanifest照合・Python構文・秘密鍵block不在を確認し、VPS develop stagingへ新規転送した後のSHAも一致した。root bootstrapはarchive SHAを検証し、root-privateへ通常fileだけを展開して実行する。**v3のVPS root実行結果はまだ未確認**。本番無効・未公開1 Claim、全故障試験未完了という状態を維持して報告する。


## v3実機結果：取消し・通信断・commit後停止、未完了の復旧

運営者のv3実行はprivate-real-machine-fixtures-ready。root stagingは`/root/plunode-publication-test-recovery.7uvw_nsd`、旧試験は`/var/lib/plunode-publication/test-attempts/49dce10f-7ba6-4c0a-8cda-d94f96d02b8c`へ保全。新backup SHA fe12eb2ae24b7c841844afef9cbf248b10aba92c83ee889fb3847cd61570553e、新closure公開鍵SHA 1f59a71bf964453bb375f3dc6e06e51c5945515a4dfc3ed9cbf062a247670239を専用SFTPで再取得して照合し、専用SSH inventoryは予約/apply履歴とも空だった。専用network IDはe13d3093cc9ada2d6701039d4767bdb4795edf3bacb8766caa9e96b1f580eeb0。

新しい合成候補は既存cycle.candidateと実Node24/TS validator/backup-planで作った。private baseはrelease-group-2/revision cd1ee4d6-b9e8-494b-8a49-47707c3a09e7、次はisolated-publication-next。候補3 Claimのうち追加1 ClaimはORIGINAL_STORY、追加はEntity/Claim/Source/Citation各1。合成3 receipt集合SHA 95e1b7a1bb999daef722896ba8aa7352d8aa6f67b4173d6df70e911e1dfb8aed、artifact SHA 956baabdff9db46e4d609d0009162047306c019548bf78a77e1de79490b9ad4c。元の正式10 receiptや本番50 Claimとは別で、正式受入・本番公開へ流用しない。

| 実機ケース | 結果 |
| --- | --- |
| 実preflight/固定承認 | rootの実validate/observe/plan成功、既存更新0。live plan SHA c3109b6582de7d66b4df03e0f5da075ebc65d091e939f5cd5abd19986c3ea1d9を専用approver署名へ結合 |
| cancel後の旧process | nonce208cf631-95c8-4e19-800e-af57a44eecc8を取消し、約5.33秒遅延させた未失効の旧署名応答を拒否。apply0。署名閉鎖証明→shadow Gitの条件付きresume→finish、実Worker parser/tickでpause解除 |
| PC側process終了 | 次nonce590c3111-d65a-43f8-989e-44d901702e46のpause push直後に専用WSL processをexit86。再生成したcoordinatorが同じintent/control revision3を回収し、二重pauseなし |
| ACK前/制御remote断 | ACK前preflight拒否。実Worker tickでpause ACK後、専用local Git remoteを一時的に到達不能へしてfetch失敗を再現。新規開始せずpauseを維持し、元pathへ戻して再起動を確認。実GitHub障害を起こしたものではない |
| 不正承認鍵 | 同じ固定requestをattester鍵で署名したものを拒否。nonce未消費、apply0のまま |
| commit後VPS gate終了 | 実専用DBのguard付きapplyが戻った直後に試験gateだけexit86。apply回数1、journal applying、nonce/release予約あり。cancel/close拒否、shadow Workerはpause-new維持 |
| verify-only再接続 | apply回数1を維持。後述の試験ledger不備によりAPI検証完了まで進めず、適用結果・凍結資材・予約を保全。復旧完了とは扱わない |

実機SSHでVPSがWSLより約4.66秒先行し、固定72338b7のpeerは既存のissuedAt<=now検査で停止した。VPSはNTPSynchronized=yes、Windows/WSL側の時計も読み取った。時計・NTP設定・期限検査を変更していない。専用試験driverだけが最大8秒以内で発行時刻到達を待ち、**その後に同じ未変更の時刻/署名/receipt/実ACK検査を実行**した。専用VPSプロトコルの結果と、固定WSL peerそのままでの完全結合成功を混同しない。本番有効化前には時計同期と実peerによる往復再検証が必要。

試験driverが作ったledgerにpending（API確認対象UUID集合）が欠落していた。これは今回の試験資材作成の不備であり、元の通常cycle.auditはこの項目を出力する。凍結後の補記やARTIFACT/署名/nonceの再発行、再applyはしない。試験だけのadapterに、**上記nonceとartifact SHAに固定**し、rootに保存された適用前backupと署名済みdataの完全差分からpendingをメモリ内で再構築して既存TS/API verifierへ渡す処理を用意した。既存行の変更/削除、counts不一致、別nonce/別artifactは拒否する。元の凍結bytes・承認・journal・予約は保全する。この試験用修正は本番coreへ入れない。

合わせて通常公開CLI/core候補には、ledgerの対象UUID/件数をasset検証時に必須化し、実preflightで実backupとの差分全体に一致することをapply前に確認する修正を追加した。候補18・executor24・試験adapter11、計53試験成功。新しい本番向け検査は**コード候補であり、VPS/WSLの固定72338b7へ未導入**。本番有効化前に固定code/trust manifest更新のレビューと運営者承認が別途必要。

専用fixture verifierだけを原子的に更新する一回用資材を転送・SHA照合済み。archive 6,811 bytes、SHA12254ee6b943d339bbb344485825f6e96ccea7b3d225bd99356c9a6bace1d464。bootstrap repair-private-verifier-v1.py SHA187df2e4f7023fc820da7e22518a3aaf0115c2d2b71a68b54fa28bb7757692e4。root修正は未実行。test operation.lockを短時間取得し、旧wrapper SHA/固定core/対象job/単回apply/元承認と凍結全fileを確認して旧wrapperをfsync保全→新試験wrapperへatomic replaceする。変更前後で本番trust・凍結全file・承認・journal・予約の全SHAを照合する。本番installer、正式KG、Worker制御、SSH reload、鍵変更を含まない。

現在：**本番導入済み＝はい（disabled）／専用DB試験＝commit後停止まで実機確認、verify-only完了とcleanupは未完了／本番有効化済み＝いいえ／再開操作＝試験verifier更新のsudo結果待ち**。正式未公開1 Claimは未公開のままであり、試験の1 applyと混同しない。

機械可読の今回の実機結果（未完了を含む）は[PUBLICATION_REAL_MACHINE_20261021.json](PUBLICATION_REAL_MACHINE_20261021.json)に保存する。


## 試験verifier更新後：再applyせず内部診断へ

運営者がSHA固定のrepair-private-verifier-v1を実行し、private-fixture-verifier-updatedを確認した。保全先は `/root/plunode-publication-verifier-fix.c1fktb71`、旧wrapperは `/var/lib/plunode-publication/test/trusted/verifier-before-7cf9a5f0d53a.py`。旧SHA7cf9a5f0…から新SHA37030d0c…へ試験wrapperだけを更新し、凍結資材・承認・journal・予約のbytes不変、試験apply1、本番apply0、本番無効を確認した。修正installerは再実行しない。

同じnonce590c3111…のexecuteを専用SSHで一度再開したところ、phaseは `operator-inspection-required-no-reapply`。予約を認識してverify-onlyへ進み、apply回数は**1回のまま**である。別の内部ValueError/OSError等が隠蔽されているため、原因は未確定とする。completed、close/resume/finish、再適用拒否、cleanupはまだ成功扱いにしない。専用DB/Webとroot journalを保全し、shadow Workerはpause-newのまま。実Workerは別であり制御しない。

非rootの既存develop SSHから専用bridge上の実APIを読み、未変更72338b7のverify-publication.verifyをall_claims=Trueで実行した。試験revision `2fb283f6-b1e6-46ce-a9aa-44d5985c81d1` で、新規合成Claimの名前検索・Claim本文・ORIGINAL_STORY/ISBN scope・Source/Citation・Graph 1ページ・最終revision一致は成功。これはroot gateの完全graph/receipt/API複合検証の完了や、固定WSL peerの時計差問題の解消を意味しない。

次の `ops/diagnose-publication-acceptance-verifier.py` は同じwrapper SHA・nonce・artifact・予約・apply1回を確認し、**既存Backend.verifyだけ**を呼ぶ読み取り診断。dispatchだけをメモリ上で診断へ置換し、rootプログラムやjobを変更しない。Docker argvはruntime verifyだけに制限し、凍結資材・予約・job・本番configの前後SHAを照合する。HTTP本文/env/子process出力/stack localsは出さず、HTTP statusまたは固定理由・file/lineを報告する。実VPS転送後のSHA一致、非root拒否・書込なし/予約維持・秘密を含む例外の非出力を含む14試験成功。

再確認時も本番API revisionは88437056…、docker/containerd/caddy/ssh/resale-ebay-notificationsはactive。実Worker config SHA d3411e24…と正式receipt10件を維持。root gate内の保護情報は既存develop/専用SSHから読めないため、運営者端末のsudoによる**読み取り診断結果だけ**を待つ。追加の導入承認待ちではない。診断後も同一nonceのverify-onlyから再開し、予約消去・再apply・旧installer再実行はしない。

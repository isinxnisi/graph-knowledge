# Issue #33 本番導入前の実環境確認（2026-10-21 JST）

現在：**本番導入済み・公開無効を維持／専用DBの実機故障試験は準備途中**。以降の導入前記録は当時の観測として残す。[確定差分・影響・復旧・一括承認対象](../runbooks/PUBLICATION_ROLLOUT_20261021.md)。既存PUBLICATION_GATE_INSTALLATION/PUBLICATION_COORDINATIONを使用し、公開済み50 Claimを再公開しない。

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

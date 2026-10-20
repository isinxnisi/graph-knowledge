# Issue #33 本番導入前の実環境確認（2026-10-21 JST）

状態：**読み取り確認済み／本番導入は運営者判断待ち**。[確定差分・影響・復旧・一括承認対象](../runbooks/PUBLICATION_ROLLOUT_20261021.md)。既存PUBLICATION_GATE_INSTALLATION/PUBLICATION_COORDINATIONを使用し、公開済み50 Claimを再公開しない。

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

# Issue #33 本番導入の一括承認対象 P33-INSTALL-20261021

2026-10-21 JST。**一括承認受領済み・VPS root実行待ちの導入案**。[既存導入手順](PUBLICATION_GATE_INSTALLATION.md)と[PC停止時の協調手順](PUBLICATION_COORDINATION.md)を用いる。読み取り結果は[実環境確認](../verification/PUBLICATION_ENVIRONMENT_20261021.md)。本番KG apply/restore、既公開50 Claimの再公開、会員DB、Web/Caddy/Composeの切替、稼働Worker停止を含まない。

## 承認する変更の集合

承認は下表を一括で対象とする。ユーザーによる明示承認前は、VPS/WSLのroot操作、鍵生成・配置、ユーザー追加、Docker load、SSH reloadを実行しない。

| 対象 | 確定操作・配置 | 影響・復旧 |
| --- | --- | --- |
| VPS専用主体 | 新規system user/group `plunode-publish`、`plunode-upload`、`plunode-audit`。パスワードはロック。Docker group/一般sudoなし。実行・upload主体のhomeはroot管理、auditはnologin | 既存user/group変更なし。不具合時は新鍵/限定sudo入口を無効化。userは監査後に削除可能 |
| 固定プログラム | `72338b7054b3f2eb2e9762b20859044f9b9e28ce`のwrapperを `/usr/local/sbin/plunode-publication` root0755、本体8ファイルを `/usr/local/lib/plunode-publication/` root0644で新規配置。各SHAをmanifest照合 | 既存公開scriptは維持。新入口を無効化すれば旧運用へ戻れる。旧コード・受入成果を削除しない |
| gate state/trust | `/var/lib/plunode-publication` root0751、trusted/jobs/frozen root0700、outbox0755。config0600は **deploymentEnabled:false**。inboxはroot:plunode-upload 2770 | 既存root-owned共通lockは取得確認だけ。新nonce/公開依頼を作らない。journal/nonce/backupは復旧時も消さない |
| 限定sudo | `/etc/sudoers.d/plunode-publication` root0440。`plunode-publish ALL=(root) NOPASSWD: NOSETENV: /usr/local/sbin/plunode-publication`。visudo検証後配置 | 固定wrapperがmode+UUID以外を拒否。一般shell/任意Python/Dockerをsudo許可しない。復旧時は新sudoersのみ無効化 |
| SSH実行鍵 | WSLで専用Ed25519鍵を新規生成、VPSの `/var/lib/plunode-publish-home/.ssh/authorized_keys` root0644へ公開鍵だけ配置。restrict＋固定publication-ssh.py強制 | 既存develop鍵/known_hostsは維持。秘密鍵はWSL0600の専用0700ディレクトリ。新鍵を外せばアクセス停止 |
| SSH upload鍵 | 別Ed25519鍵。`/var/lib/plunode-upload-home/.ssh/authorized_keys` root0644。restrict＋internal-sftp固定 | uploadは `/var/lib/plunode-publication` へのchroot、開始位置/inbox。trusted等は0700で読めない。shell/TTY/forwardingなし |
| SSH account設定 | 新規 `/etc/ssh/plunode-publication.conf`、既存sshd_config末尾にInclude 1行を追加。上記2 accountだけpublickey認証、TTY/agent/TCP/X11/tunnel/user-rc禁止。環境取り込みは既存globalのnoを確認し、Match未対応項目を配置しない。sshd -t、既存developのeffective設定同一を確認して**sshを一回reload** | 稼働SSH接続は保持し、別接続で確認。構文/reload失敗なら元sshd_configへ戻して再検証/reload。既存全体の認証方針は変更しない |
| 署名鍵 | WSLに別々のapprover/attester Ed25519鍵（0600）。approverは運営者の手動署名専用、自動peerへ渡さない。公開PEMだけVPS trustedへ。閉鎖証明専用鍵はVPS root0600で新規生成 | 各公開鍵SHA256を双方でpin。既存鍵を変更/転送しない。秘密鍵はGit/Issue/ログ/転送archiveへ入れない。暗号化保管とrotationを運営者が確認するまで本番有効化しない |
| 読取backup | 固定ops imageのcapabilities/observeだけを実行し、現revision/releaseを照合した完全公開KG backupを新jobs/install-readonly-backup.json root0600へ保存。転送コピーだけexport/にupload主体0600で配置し、WSLのGit外0600へSHA検証して受領 | 本番KGへの書込なし。原backupはrootで保全し、転送コピーは受領後除去可能。新正式receiptが別工程でできた場合の受入比較にも再利用できる |
| 公開KG資格情報 | rootが既存Composeのops環境からNEO4J_URI/USER/PASSWORD/DATABASE **4項目だけ**を新trusted/public-kg.env root0600へ複写 | app.env/PG資格情報は不変更。PG項目は複写せず、ログにも出さない。新ファイルは入口無効化後に監査/保全判断 |
| ops image | 検証済みID `sha256:af1216c98ef75ad0fdba1424d854fc26802af066f684c77af79f9bf6f6cf880f` linux/amd64を、SHA検証済み単一・untagged archiveからdocker load | Web/既存opsのtag/Composeは変更しない。未使用imageを残しても動かない。docker prune/共有layer削除はしない |
| WSL trust/client | `/usr/local/lib/plunode-receipts/72338b7054b3f2eb2e9762b20859044f9b9e28ce/`に元repo layoutの固定版をroot所有で配置。`/etc/plunode-publication/`にhost key/閉鎖公開鍵/固定client設定。鍵・journalは既存UID isinxnisiの専用private領域 | 稼働Workerのhome/runtime/config/cache/state・タスクは不変更。共通lock/worker.lockの所有UIDに合わせ、新WSL userや広域sudoを追加しない |
| 実機試験専用資材 | VPSの新規private Docker network `plunode-publication-acceptance-20261021`、公開portなしの一時Neo4j、tmpfs data/log、試験Webのloopback `127.0.0.1:32740`。WSLに別home/別Git制御remote/別鍵の試験Worker。rootの固定試験入口とSSH試験用公開鍵も一時追加 | 本番network/volume/KG/会員PGへ接続しない。Neo4j最大768MiB＋試験Web最大384MiB、同時1組。メモリ余裕/port/名前競合は開始前に再確認。終了時は作成した資材だけ除去し、試験journal/証跡を保全 |

実機試験のroot入口は専用DB/network/loopback/state pathに固定し、本番wrapper/configは無効のままにする。試験用sudo・SSH鍵は本番用と別で、試験後に除去する。この追加も上記一括承認に含める。テスト入口を残したまま本番有効化しない。

## 読み取りで未確定の情報と導入時の停止条件

現SSHのdevelopはsudoパスワード必須、Docker socketアクセス不可。rootの実Compose/network/image/container詳細、sudoers実効値、共通lockのrootからの完全確認はまだ済んでいない。インストーラーは、root昇格後・変更前にこれらを確認する。期待値は既存project `graph-knowledge-production` / network `graph-knowledge-production_default` / URI `bolt://graph-neo4j:7687` / database neo4j / 公開revision `88437056-b74f-42ab-88c0-33ed435bdccc`。相違、既存の同名導入物/user、共通lock使用中なら変更前に停止し、勝手に別targetへ適応しない。Docker load後の失敗では未使用imageが残る場合がある。

rootからの確認と画像配置を先に済ませ、正常なWorker定期ロックを強制解除しない。実機故障注入は試験用peer/SSH接続/container/Workerだけを対象にする。PC/WSL全体やVPS全体の再起動は既存サービスを止めるため、この承認集合では実行しない。独立プロセス終了・再起動と専用接続断で確認し、ホスト全体の電源断試験と区別する。

## 承認後の運営者操作

1. この一括変更集合への承認をチャットで記録する。秘密情報はチャットへ渡さない。
2. 承認後にCodexが専用鍵・公開鍵入力・固定clientを準備し、公開鍵fingerprintを提示する。VPSへはプログラム・**公開鍵**・imageだけを既存develop SSHでstaging転送する。秘密鍵は転送しない。
3. VPSのsudo認証だけは運営者が既存端末で行う。転送後に固定SHA入りの**一回のbootstrapコマンド**を提示する。これはuser-writable stagingを直接sudo実行せず、root-private directoryへ複写→archive全体SHA検証→展開→`python3 -I install-publication-disabled.py`の順に実行する。WSLは承認後の `wsl.exe -d Ubuntu -u root` で固定bundleを配置できる。パスワードをCodexへ送らない。
4. Codexがdisabled時のroot/sudo/SSH/chroot/鍵/manifest/imageと、公開KGの**読取だけ**の接続を確認する。隔離DBでapply、pause/静止、close/cancel→resume→finish、通信断、旧process復活、結果不明verify-only、再apply拒否を実機確認する。50 Claimの本番再公開はしない。
5. 現段階の通常承認では、本番configはfalseで終了する。本番有効化まで条件付きで承認する場合も、全実機試験・鍵保管/pin・既存サービス/公開revision不変・main/runtime双方の最新正式receipt棚卸し・試験入口撤去を満たした結果を記録してから行う。未公開0件なので有効化しても公開依頼/applyは作らない。各将来releaseの固定承認は引き続き必要。

## 復旧の具体手順

- 失敗/中断時は再実行で初期化しない。新SSH鍵を外し、新sudoersを無効化して新入口からの起動を止める。本番configはfalseを確認する。既存SSH sessionは残す。
- SSHを戻す場合はrootに保存した `trusted/sshd_config.before` と現config/candidateのhashを照合する。導入後に他のSSH変更があれば自動上書きせず差分を人間が確認する。一致時だけ元configへ戻し、`sshd -t`→`systemctl reload ssh`→既存developで別接続を確認する。user/rootの既存鍵や他サービスの設定を消さない。
- 新しいpublication directories/journals/keysはrootで保全し、証跡確認後に扱いを判断する。新規accountを削除するときもhome一括再帰削除や既存volume削除はしない。nonce/reservations/receiptは削除しない。
- 試験container/networkは作成時ID/labelを照合したものだけ停止・削除。全container停止、docker prune、実KG/PGのstop/restoreはしない。
- インストーラー途中失敗後は同名存在検査で止まる。完了と扱わず、作成済み差分とroot-private stagingのinstallation-failure-*.json（operation/error type/reasonだけ、stdin/env/subprocess出力なし、0600）を確認して再開点を運営者と確定する。

## 資材と現時点の状態

`ops/install-publication-disabled.py`はこの一回の導入専用。公開処理本体の再実装ではない。実行引数なし・root-private SHA検証済みstaging専用であり、現段階ではrootで実行していない。鍵入力と転送archiveの最終SHAは承認後の生成時に確定し、承認前に架空の鍵pinや運営者署名を作らない。

ローカルexportは801,273,856 bytes、SHA256 `1712fec50b1467a45e7ba1f01abb5ff6eb12d4fb6e6d75e43dfa0247efd2dbdd`。1 image、RepoTags=null。公開用imageの本番loadは未実行。新installerを構文/非root拒否/書込境界で確認したことを、実root導入済み・実機検証済みとは数えない。

## 一括承認後の進捗

運営者はチャットで「導入・実機試験を一括承認（本番は無効を維持）」を選択した。追加の本番有効化承認はない。
WSL固定repo 72338b7をroot所有で配置し、実行/upload/attester鍵を専用0700領域へ作成した。approver秘密鍵は `/root/plunode-publication-operator/approver.pem` root0600とし、常設自動実行UIDから分離した。公開PEMだけを転送する。固定SSH clientはroot所有・固定host key・専用identity・ユーザーSSH config無視で導入した。暗号化保管/rotationの最終確認は本番有効化前に残る。

導入archive（秘密鍵なし）は255,176,639 bytes、SHA256 `8492008b198b026be1822a79fba12fc94998db45bec0df1b8277c5b97119ee23`でVPS転送後も一致。
最終照合でinstallerにもCompose `--profile ops`が必要と判明したため、旧installerを実行しないよう通知した。修正版は別途SHA固定で転送し、root-private stagingでarchive検証後にinstallerだけを差し替えて実行する。実Compose CLIを用いた回帰試験を追加し、opsを取得・member profileを除外することを確認した。VPS導入成功や実機DB試験を示す記録ではない。


## 実機試験資材の境界

`ops/provision-publication-acceptance.py` と `ops/publication-acceptance-entry.py` は承認済みの一時試験だけに用いる。本番ゲートがdisabledであることを毎回確認し、試験root `/var/lib/plunode-publication/test`、network `plunode-publication-acceptance-20261021`、URI `bolt://plunode-acceptance-neo4j:7687`、loopback API 32740、shadow Worker `isolated-worker` に固定する。既存Neo4j/Webの実image IDを読み取り、それぞれ新しい一時containerへ用いる。会員envは渡さず、試験WebはMEMBER_STORAGE_ENABLED=0とする。初期2 Claim、候補3 Claimは別UUIDの合成データであり、本番50 Claimを再applyしない。

元72338b7のGate、署名・nonce・durable pause・DockerBackend・公開後検証を再利用し、試験入口だけで共通lock/APIを専用先へ割り当てる。試験用の別SSH/approver/attester/closure鍵を用いる。実commit後のgate process終了は専用のcrash-after-commit操作で試験し、再試行時のapply呼出し数をroot-owned journalで数える。fixtureのGitHub通知は行わない。

cleanupは試験network ID/label、接続containerのimage/label/所属networkを照合してから、その試験資材だけを除去する。専用SSH鍵行と試験sudoersだけを撤去し、root journal・backupは残す。未知の接続/変更があれば自動削除しない。これらのコード/合成データvalidate・拒否試験の成功は、実VPSでの導入・通信断・DB試験成功とは区別して記録する。

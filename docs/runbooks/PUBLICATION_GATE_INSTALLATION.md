# 公開実行ゲート候補の導入・運営者操作（Issue #33 第2段階）

2026-10-22の現状と次の承認対象は[本番有効化前の固定版更新・接続確認](PUBLICATION_ENABLEMENT_READINESS.md)を参照。以下の初期設計・隔離段階の未完表記は後続実測で更新されている。

現在の導入結果は[2026-10-21の実機検証記録](../verification/PUBLICATION_ENVIRONMENT_20261021.md)と[一括導入手順](PUBLICATION_ROLLOUT_20261021.md)を参照する。本番にはdisabledで配置済み、故障試験は未完了であり、本書の以下は第2段階実装時点の記録である。

2026-10-21の実機でPython署名canonicalとTS stableJsonのmanifestキー順差を確認した。次の本番固定版候補はTS runtimeのmanifestFileSha256返却を必須capabilityとし、Pythonは凍結manifestのraw SHAを照合する。TSのDB receipt/全graph検査は維持し、署名canonicalは変更しない。旧imageを適用前に拒否するため、code/image/trust manifestを一組で更新する必要がある。現在の72338b7導入物はdisabledのまま変更していない。

2026-10-20。**隔離実装・試験用の導入候補**。この文書は本番のsudo／SSH／鍵／image／DB変更や公開承認ではない。現行VPSへ配置していない。`ops/publication-config.example.json` は `deploymentEnabled:false`。実root／sshd／sudoersの有効性は未検証であり、以下を運営者がレビューして別途承認する。

本書の共通flock単独peerと公開手順は、後続の [公開・受入協調手順](PUBLICATION_COORDINATION.md) で補強する。方式選定とPC停止時の契約は [協調設計](../design/PUBLICATION_COORDINATION.md) を現行仕様とする。

## 実装された境界

| 部分 | 実装・検証 |
| --- | --- |
| root入口候補 | `ops/plunode-publication`。固定配置先、root所有／非group-write／no-symlinkを検査し、Python -I・環境初期化。caller指定program／cwd／PYTHONPATHを利用しない |
| gate本体 | `scripts/publication-executor.py`。`arm / preflight / execute / status / notify / close / cancel / finish` とUUID v4だけ。root用は固定root、sandbox用は非rootの別入口 |
| 収容・freeze | uploadをdirectory FD＋O_NOFOLLOWでコピー。通常file・単一link・1 file 64MiB／全256MiB／4096 file以内。固定artifact hash／各asset／planを確認。uploaded scriptを実行しない |
| 承認 | 前段のpolicyを再利用したEd25519・鍵pin・全binding・nonce・期限。`publication-sign.py` は明示operator-approvedと固定requestから署名。秘密鍵を送信しない |
| nonce／release予約 | OS flockの下でfile fsync→rename→directory fsync。nonceとreleaseを予約してからapplying journalを保存し、一度だけapply。保存結果不明も保守的に予約済みとして扱う |
| DB境界 | 固定image IDとlinux/amd64／capabilities。公開用4資格情報だけを許可。既存public CLI／backup／plan／graph検査を再利用。新guardはreadとwrite transaction内でexpectedRevision・追加のみを再検査 |
| 復旧 | DBのDatasetRelease manifest digest＋data hash＋全graph fingerprintで一致確認。応答喪失・検証失敗はverifyのみ。証明不能は人へ戻し、別nonceによる同releaseの迂回も拒否 |
| 公開後確認 | 完全graph／DB件数に加え、既存verify-publicationの全追加Claim・名前・Graph・根拠を固定loopback APIで確認 |
| 監査 | 完了outboxを公開メタデータだけで生成。別の非特権audit accountが固定Issue #33へ送信。nonce markerで重複送信を抑制。送信失敗はnotifyのみ再試行、DB・apply・receipt照合を再実行しない |
| WSL peer試作 | `publication-attest.py`。共通flock取得→固定client起動→二回の短期challengeに元receipt／本文／Role／scope／根拠／全差分を照合して署名→remote終了まで保持。使用中は開始しない |

sandboxは自己所有UIDを擬似rootとして実processを起動する。root権限を付与した試験ではない。production用の設定読み込み・固定Docker argvも実装済みだが、VPSの実root信頼経路へ接続していない。

## 固定配置候補とmode

後日の運営者導入では `install` で新規配置し、develop所有の~/scriptをsudoで呼び出さない。既存の公開スクリプトは履歴として保存する。

| path | 所有／mode・目的 |
| --- | --- |
| `/usr/local/sbin/plunode-publication` | root:root 0755、ops/plunode-publicationの固定入口 |
| `/usr/local/lib/plunode-publication/` | root:root 0755。executor／policy／cycle／exclusion／sign／verify-publication.py／publication-notify.py／publication-ssh.pyを固定版で配置。各0644、外部から更新不可 |
| `/var/lib/plunode-publication/` | root:root 0751。一覧不可でも既知outboxへのtraverseを許可 |
| `trusted/` | root:root 0700 |
| `trusted/config.json` | root:root 0600。既定disabled。operator config ID、network、DB target、別々のapprover／attester public PEM SHAを固定 |
| `trusted/{approver,attester}.pem` | root:root 0644（親は0700）。別の運営者確認経路でpinを照合 |
| `trusted/public-kg.env` | root:root 0600。NEO4J_URI／NEO4J_USER／NEO4J_PASSWORD／NEO4J_DATABASEだけ。URIはbolt://graph-neo4j:7687。会員PGやapp.env全体を渡さない |
| `inbox/` | root:plunode-publish 0770。専用uploadのUUID directory、candidate/とapproval.json。元の所有inodeをtrusted領域へ昇格させない |
| `frozen/`・`jobs/` | root:root 0700。資材・backup・状態を保持。release/だけはcontainer USER nodeがreadonly mountで読める0755／0444。上位は0700 |
| `reservations.json` | root:root 0600。消費nonceとrelease予約。手動削除・初期化で再applyを許可しない |
| `outbox/` | root:root 0755、完了summary JSONは0644。nonce・release・artifact hash・revision・phaseだけをaudit accountへ渡す |
| `/opt/graph-knowledge/.member-activation.lock` | 既存VPS共通ロックを利用。root所有・通常file・単一linkを事前確認。削除・置換しない |

WSLのattesterはrepoの可変コードではなく、`/usr/local/lib/plunode-receipts/<固定commit>/scripts/` のように既存workflow／inventory／acceptanceと依存Pythonを含む元layoutをroot所有・非書換えで配置し、専用主体／鍵保管を別途決める。runtime内のprogramはimportしない。SSH固定clientもreview済みroot所有programとし、caller指定host／commandを受け取らない。

rootのプログラム一式とtrustを更新する操作は、公開承認操作と別にする。旧コード・journal・backupを保存し、稼働中applyを止めず、安全な区切りで設定を更新する。

## SSH・限定sudo候補

専用非特権 `plunode-publish` を利用し、Docker groupや広域sudoを付けない。SSH authorized_keysは本人が書換えられないroot所有の `/etc/ssh/authorized_keys/plunode-publish` に配置する案。password認証・TTY・forwardingを無効化する。既存developの鍵・sudo設定は変更しない。

- 実行用鍵：`restrict,command="/usr/bin/python3 -I /usr/local/lib/plunode-publication/publication-ssh.py"`。SSH_ORIGINAL_COMMANDはmode＋UUIDだけをfullmatchし、shellを使わず固定sudoへ渡す。
- upload用の別鍵：`restrict,command="internal-sftp -d /var/lib/plunode-publication/inbox"`。root所有authorized_keys・root所有homeで鍵制約を本人が解除できない構成とする。SFTPのfilesystem範囲まで限定する場合は専用uploadユーザー＋chrootを別設計し、実行用入口を同chrootへ混在させない。
- host keyを別経路で確認し、WSLの固定clientではBatchMode／IdentitiesOnly／StrictHostKeyCheckingを指定。agent／hardware等でSSH秘密鍵を保持する。新規鍵・ユーザー・sshd設定は今回作成していない。

sudoers候補は **固定wrapper一本**。任意引数を通すsudoersでもwrapper自身がmode＋UUID以外を拒否する。実機sudoのversion・visudo解析・所有権確認と、悪意あるargv／envのroot process試験を導入前に運営者が実施する。

```sudoers
plunode-publish ALL=(root) NOPASSWD: NOSETENV: /usr/local/sbin/plunode-publication
```

`bash ~/script`、`python uploaded.py`、任意docker、任意env、sudo経由のshellや一般GitHub hookは許可しない。`plunode-audit` は公開outboxの読取と固定Issue通知だけを行い、sudo・DB・Docker資格情報を持たせない。ghは同accountの安全なcredential storeで認証し、rootへtokenを渡さない。通知権限・ghの固定配置と接続も未設定。

## 運営者が行う一回の公開手順

以下の操作は**導入と信頼境界の別承認後**の設計契約。現在はlive keyや本番clientで実行しない。未公開0件の現行50 Claimを使って公開依頼を作らない。

1. 前段publication-cycle.py prepareで、現行VPSの検証済みbackupと全正式receiptから未公開差分だけのcandidateを作る。元receipt・凍結成果は変更しない。
2. UUID v4のjob nonceを発行し、inbox/UUID/candidate/へ資材をupload。WSLの独立attester keyと固定clientで `publication-attest.py ... preflight UUID`。peerは既存共通ロックが空いている時だけ取得し、root側がfreeze→image／validate→現行backup→既存更新0の実planを実施する。初回challenge待ちではVPS共通ロックを保持しない。
3. `status UUID` のrequestを取得し、**rootが実planから作ったplanSha256**を含む差分を人が確認する。前段のoffline plan hashをそのまま公開承認へ転用しない。承認待ちでは両側ロックを解放する。
4. `publication-sign.py --request live-request.json --nonce UUID --key PROTECTED-TEST-OR-APPROVED-KEY --minutes 30 --output approval.json --operator-approved`。署名対象は環境／release／base revision／receiptSet／artifact／live plan／operator digest／nonce／発行・失効時刻。approval.jsonだけをuploadする。
5. WSL固定peerで `execute UUID`。共通lock保持下でreceipt本文・根拠・差分を再照合。rootも同じpreflightと署名・失効・最新challengeを再照合してからnonceを永続予約し、唯一のguard付きapplyを実行する。新受入・base・image・資材・plan変化は新candidate／新承認へ戻す。
6. 完了状態・新revision・全件数・全追加ClaimのAPI／名前／Graph／根拠を確認。通知失敗だけなら `notify UUID` で送信を再試行する。applyを呼び直さない。

署名CLIは今回、隔離一時Ed25519 PEM（0600）で検証した。実運用の秘密鍵についてOS暗号化保管・アクセス制御・rotationをレビューする。hardware／暗号化鍵の非対話signer integrationは未実装。平文パスワード・秘密鍵をGit／Issue／chat／logへ置かない。運営者approver keyと自動attester keyを共用しない。public keyの更新・失効はroot trust更新と既発行承認の扱いを含め、別操作とする。

## 未実装・未検証の本番信頼境界

- 実rootの所有権・sudoers・sshd・鍵pin／保管、root-owned bundleの安全な導入、実network／DB／loopback API／audit account接続。実VPSでの故障注入はしていない。
- PC停止時の論理境界は後続のdurable pause・実ACK・不可逆閉鎖・条件付きresumeで隔離実装した。共通flockだけの運用は不可。実root/SSH/鍵/ディスク/OS再起動をまたぐ導入検証は未実施であり、それまではproductionをenabledにしない。詳細と残条件は協調手順を参照。
- Docker client timeout後にcontainer／DB transactionが継続する可能性がある。nonceとrelease予約を維持し、DB receipt／digestを確認する。再apply・自動restoreで解消しない。実機でのcontainer識別・停止判断と同時実行手順は運営者が別検証する。
- ghのdedupeは外部APIのatomic exactly-once保証ではない。接続断時の送信成功不明は同nonce markerを検索してから再送する。重複コメントが発生しても公開を再実行しない。
- 本番用キー管理・実preflight／post-publication backup・正式ops image配布とdigest確認・root gateの独立security reviewを別ゲートとする。

## 停止・復旧・rollback判断

`applying`／`operator-inspection-required-no-reapply` は、適用失敗確定という意味ではない。status、予約index、backup、DatasetReleaseのmanifest digest／data hash、現行graph／revisionを保全する。一致する適用を証明できればexecuteはverifyのみ再開する。baseが旧版のままでも未確定transactionやroot journal保存失敗があれば人へ戻す。別nonce・同releaseでの迂回は禁止。

公開後検証失敗は自動restoreしない。まずAPI／graphの読取を再実施し、Web反映・DB状態・根拠を切り分ける。rollback／restore／service切替が必要なら、運営者がbackup・利用者影響・期待revisionをレビューして別途承認する。導入前／apply前の不具合は旧設定／旧コードを保持したまま実行入口を無効のままにする。journalや旧成果を消して復旧しない。

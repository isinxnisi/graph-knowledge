# 本番有効化前の固定版更新と接続確認（Issue #33）

2026-10-22。運営者承認前の導入案 `P33-READY-20261022`。本番公開は無効を維持する。以前の専用DB試験承認を、この更新・認証・branch設定・有効化へ流用しない。

[既存の導入契約](PUBLICATION_GATE_INSTALLATION.md)と[停止・再開契約](PUBLICATION_COORDINATION.md)を継承する。[専用DB試験完了記録](../verification/PUBLICATION_ENVIRONMENT_20261021.md)のapply・復旧試験は繰り返さない。試験用manifest互換adapterは本番へ配置しない。

## 現在の判定

**本番有効化は不可。** 固定版の更新、固定peerの実往復、専用audit認証・通知、制御branch保護、暗号化鍵バックアップの実作成とPC外保管が未完了。本番は旧72338b7でdisabled。既公開50 Claimを再公開せず、正式未公開1 Claimを保持する。

b845dd8の試験完了記録は、他作業の共通ロック解放後、mainの02bc6a8へ統合・push済み。既存のコミュニティ作業と未追跡memo.txtを維持した。

## 一組でレビューする資材

Python gateはmanifestの**全11ファイルの完全一致**、root所有・非書換・非symlink・単一link、固定source SHA、鍵pin・DB/network・Worker・freezePolicy、ops image IDをimport前に検査する。TSの既存DB receipt digest検査を維持し、言語間のcanonical順序差にはmanifestファイルのraw SHAを用いる。manifestFileSha256 capabilityのない旧imageは拒否する。

| 対象 | 固定値／確認内容 |
| --- | --- |
| ops image source | f81295562e8b540c503cf4727cdac790e431cf48。コピー対象173ファイルをGit blobと照合 |
| image config ID | sha256:3bcfe13d0c238710db212f4641f43f4d81d2dff72e58726b374bba9a41b26cbf |
| VPS containerd manifest ID | sha256:367e9c36401f4f3c7f3a50e829c4c82bcaf83a9e0df72aba91ea03e4b856e528 |
| image archive | SHA256 853c3ceade766b116ac3e04a304ba93158f5b87af5a4485fb445caefca58a8d5、801273856 bytes。config/manifest/全11 layer bytesを照合 |
| 通知binary | Ubuntu noble-updates/security gh 2.45.0-1ubuntu0.3 amd64からbinaryだけを抽出。SHA256 2fd925d68889746976958342fb749bf102bc7dc8bcba3abfa533a80ad7791673。apt導入・サービス追加なし |
| public base | manga-issue-25-utc-recovery-08-normal / 88437056-b74f-42ab-88c0-33ed435bdccc |
| 全正式receipt | 10件、集合SHA256 8a55413ee9fedf32fd64ce6fddebd28d1d636ff7de0fcc1fd063a5b15524d56d |
| 現Worker | 973c7b0c599f79905a029b28b524f4924e169376、plunode-wsl。設定SHA d3411e24937f2f422495bf347bac9361b5a6364375443d104c266f96de4763e9 |

Python/peerのsource SHAは、image sourceと異なる。配布manifestは両者を明記し、それぞれのbytesを固定する。後続の固定資材一覧に承認対象source・manifest・bundle SHAを記録する。

## 一括承認の変更対象・操作・影響・復旧

| 変更対象 | 承認後の操作・影響 | 復旧・保全 |
| --- | --- | --- |
| VPS固定program | /usr/local/sbin/plunode-publication、同readiness入口、/usr/local/lib/plunode-publicationのPythonと固定ghをroot所有で更新。import前のprogram-manifest検査を追加 | root-private stage/previousとrollback.jsonへ旧bytes/modeを保存。rollback-publication-readiness.pyは新旧SHA一致時だけ復元。KG・receipt・nonce・journalを戻さない |
| ops imageとtrust | 上記imageをloadし、trusted/config.jsonのoperatorDigestと新program-manifestを一括更新。**deploymentEnabled=false**。approver/attester/production closure pin、DB envは維持 | 旧imageを削除せず旧configを保全。失敗時もdisabled、新imageは未使用で保持。途中更新を隠して再実行しない |
| 一時読取入口 | 既存SSH固定parserにreadiness-7操作だけを追加。別root /var/lib/plunode-publication/readinessと専用closure鍵。限定sudoersは固定readiness wrapperのみ。image/validate/observe/plan以外のbackend stageを拒否 | 成功後cleanupが全ticket finished・予約なしを確認して一時sudoersを削除。失敗時は同nonce cancel/resume/finishの位置から回復、journalを保全。activeがあればrollbackを拒否 |
| audit認証 | plunode-audit所有0600の.config/plunode-publication/token。運営者が選択repoのIssues読書きだけのfine-grained PATを端末へ非表示入力。固定ghへGH_TOKEN環境で渡す | root/sudo/DB/Docker権限は追加しない。tokenはargv・outbox・Issue・chatへ出さない。rollbackは固定path/hash一致のtokenだけ削除し、運営者がPATを失効。credential用directoryと監査証跡は保持 |
| WSL固定peer | /usr/local/lib/plunode-receipts/新source SHAをroot所有で追加し、新readiness-clientだけを/usr/local/binへ配置 | 旧723 snapshot・本番client・coordinator設定は維持。新clientのSHA確認後に撤去して旧経路を維持できる。新snapshotは不活性な証跡として残す。live Worker/runtime/cache/stateを変更しない |
| 鍵保管 | WSLのapprover/attester/SSH2鍵と公開設定、VPSのproduction closure鍵・audit token等をそれぞれroot-private stageでAES256暗号化。端末入力の16文字以上のphrase。復号一致をメモリ内で確認、平文tarを保存しない | 既存秘密鍵を変更しない。暗号化fileのSHAを照合してPC/VPS外へ運営者が保管し、phraseは別保管。暗号化コピーだけではPC外保管完了としない。短命の専用GPG agentはfinallyで停止 |
| GitHub制御branch | codex/collection-controlへ下記の最小protectionを追加。現在はpublic repo、protected=false、protection404、effective rulesなし。通常FF pushは維持 | 直前に状態を再読取。既存ルール出現時は上書き停止。作成結果を保存し、復旧は自分が作った同一設定のみを別途確認して撤去。第三者ルールやmainの保護を変更しない |

新ユーザー・SSH鍵・sshd設定/reload・systemd設定・会員DB・検索UI・公開KGの書込みは含まない。既存VPS共通lockをnonblockingで短時間取得し、入力・暗号化・通信待ち中は保持しない。競合時は既存jobを尊重して再確認する。強制解除・二重起動はしない。

protection要求の固定bodyは以下。required_status_checks/review/restrictionsを追加せず、既存Workerのappend運用を維持する。adminを含むforce push/deleteを拒否する。

```json
{"required_status_checks":null,"enforce_admins":true,"required_pull_request_reviews":null,"restrictions":null,"required_linear_history":true,"allow_force_pushes":false,"allow_deletions":false}
```

fine-grained PATは[GitHub CLI公式のGH_TOKEN方式](https://cli.github.com/manual/gh_auth_login)を用いる。tokenの権限・有効期限・所有者は運営者が確認し、期限切れはaudit-pendingとして再通知のみ行う。自動更新・期限なしtoken・管理scopeの追加はしない。[branch保護の公式仕様](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)と実APIの結果を区別する。

## 承認後に集中する実機確認

1. VPSとWSLのbundle全体SHAを運営者端末で検証し、root-private stageへ安全に展開して固定installerを実行する。audit PATとbackup phraseは各端末の非表示入力だけ。VPSは既存9 program・鍵pair・inactive journal・public base/revision・image全bytesを照合してから更新する。WSLはapprover/attesterの公開pin、private mode/ownerを検査する。失敗時はJSONのoperationと保全先だけを共有し、旧installerを繰り返さない。
2. 新imageでpublic KGの**読み取りbackup**を採取する。固定release/revision、既公開50 Claimの意味・Role・scope・根拠、最新10 receipt、未公開0/1/1/1を再照合し、既存CLIで新release候補を作る。採用receipt確定後にrootの実無書込planと比較する。候補は正式未公開1 Claimだけの追加で、既存更新0とする。
3. 新しいroot所有publication-attest CLIと固定host/key clientを実SSHで往復する。実receipt/runtimeは読み取り、pause/ACK/cancel/resumeは独立shadow Worker/local Gitだけで行う。live Workerのpause・設定・cache/stateを変更しない。既存WSL lockは別途短時間nonblocking取得で使用条件を確認し、待機中には保持しない。
4. VPSの一時入口はpublic DBをvalidate/observe/planするだけ。preflight後cancel→署名閉鎖→shadow条件付きresume→finishまで行い、予約なし・apply0・public revision不変を確認する。以前の専用DB apply/復旧を再試験しない。
5. 固定plunode-audit accountからIssue #33へ「読取接続確認・applyなし」を一度送信し、再送ではmarkerを検索して重複抑制する。認証失敗時はauditだけ再試行する。これは本番公開完了通知とは区別する。外部APIの厳密exactly-onceは保証しない。
6. 全ticket finishedを確認して一時sudoを撤去し、暗号化backupのPC外保管を運営者が確認する。新source/image/trust・鍵pin・branch保護・Worker設定/receipt・本番disabledを再検証する。

peerはissuedAtが最大8秒先ならmonotonic予算内で待ち、発行前には署名しない。expiresAtを延長せず、署名前にも再検査する。期限切れ、9秒以上先、60秒を超えるchallenge、時計の逆行で予算超過した場合は停止する。ホスト時計/NTPの変更は行わない。actual SSHの時刻読取では差の可能範囲が0を含むが、これを実peer成功の代用にしない。

## 鍵rotationと日常運用

approverはWSL root0600で通常UIDから読めず、attester/SSH鍵は当該UID0600。production closureはVPS root0600。各pairの公開SHAとhost key fingerprintを別経路で照合した。暗号化バックアップは単一PC喪失に備えるもので、稼働鍵自体はOS上の0600鍵でありhardware signerではない。

rotationは**実施していない**。実施時は、active ticketがないことと既存予約を読取確認→新鍵を権限を分けて生成→暗号化/復号/PC外保管確認→新公開pinとroot trust manifestと固定WSL設定の一括変更を承認→新署名受理/旧署名拒否を読取challengeで確認→旧署名承認を再発行→旧SSH鍵/PATを失効、の順。nonce/release予約・閉鎖履歴は引き継ぐ。closed/consumed nonceをrotationで再利用しない。closure rotationは未完ticketの閉鎖・resume検証を完了するまで行わない。SSH host keyのrotationは別経路でfingerprintを確認し、StrictHostKeyCheckingを弱めない。PAT rotationは新tokenで固定通知を確認後に旧tokenを失効し、DB操作を伴わせない。

署名失効とkey pin差替えはダミーEd25519鍵で検証した。実鍵のrotationやPC/VPS再起動試験を実施済みとは報告しない。audit認証とbranch保護が整っても、共通lock外の受入workflow直叩きやrootによるjournal削除をこの機構だけで禁止できるとは扱わない。

## 有効化・公開の別判断

今回の一括承認は**固定版更新＋read-only実接続確認まで**。config=falseは維持し、本番有効化・署名承認・execute/apply・restoreは含まない。

上記完了後に、運営者が鍵の保管/復旧責任と運用主体、branch運用、live Workerの公開時pause/resume契約、通知障害対応を確認したうえで、固定source/image/trustを指定した有効化の明示承認を行う。各releaseの公開は、最新receipt集合・artifact・live plan・base revision・image・短期期限・単回nonceに固定した別の署名承認を必要とする。未公開1 Claimは候補準備だけで公開済みへ移さない。

## 固定資材と未実行入口（P33-READY-20261022）

承認対象Python/peer sourceは **9b59669f282f811a22c7f276ecae61ca16ec499e**。[program manifest](../verification/publication-readiness-20261022/program-manifest.json)、[配布一覧](../verification/publication-readiness-20261022/fixed-assets.json)、[今回の検証結果](../verification/publication-readiness-20261022/report.json)を一組としてレビューする。manifest SHAは a7b5a171a76a2fc9beb162cc021e5c9a5435da14e32f25736b99f09aff03434d。

| 資材 | bytes | SHA256 |
| --- | ---: | --- |
| VPS bundle | 251666469 | 70dd6f7d57a0dd72bbb62f428ecf4ec1b7723e73749a9b98e3905cfdf649ff57 |
| WSL bundle | 48882522 | 741ed20f110af813842208419aabbbfb9122570a4cb420ed44e231ac6ad6ad7e |
| VPS bootstrap | 3674 | 229597e9b05c7502f9b81fcee1faf22ecaffcfbb3188df717c9c26ef7c9f7b2c |
| WSL bootstrap | 2282 | bd45e36703f3bb878e303a1ff00b27071a37dfe35627e5e53bd0b6f6c72405e2 |

[VPS loader](../verification/publication-readiness-20261022/bootstrap-readiness-vps.py)と[WSL loader](../verification/publication-readiness-20261022/bootstrap-readiness-wsl.py)は、whole bundleをroot-private stageへコピーしてSHA照合し、固定file集合・個別SHA・size・通常file・重複/絶対/親path禁止を検査してからinstallerへ渡す。installerをhomeから未検証でsudo実行しない。bundleに秘密鍵・token・DB envは含まない。VPS bundle/bootstrapはdevelop所有stagingへ転送し、受信SHAを照合済み。root導入は未実行。

VPSの場所は /home/develop/plunode-publication-readiness-20261022/、WSLは ~/.cache/plunode-publication-readiness-20261022/。承認後、各端末でhash付きloaderをsudo実行する。VPSでは監査PATとVPS暗号化phrase、WSLではWSL暗号化phraseを運営者が入力する。新PATは選択repoのIssues読書き・有効期限を確認し、既存開発者credentialをVPSへコピーしない。入力値を返信しない。結果JSONと保全先だけを共有する。

VPS rollbackは同じroot stageの rollback-publication-readiness.py にそのstageを唯一の引数として渡す。active ticketがあれば先に既存cancel/署名閉鎖/条件付きresume/finishで閉じ、強制解除しない。root installerは自動で再実行しない。WSLの新clientは上記source内のSHAと一致する場合だけrootで撤去できる。旧固定snapshotと旧本番clientは変更していないため切戻し対象ではない。暗号化backup・履歴を消して復旧しない。

今回、runtime全10 receiptは一致し、mainにある旧3 receiptも同じSHAだった。後続7 receiptはruntimeに存在し、mainの同pathには存在しない。mainへ複製・再受入せず、正式runtimeを受入正本として候補とfreshnessを検証する。360個の読取対象が不変。棚卸しCLIで既公開50 ClaimのAPI・意味・Role・scope・根拠を確認し、未公開はEntity0/Claim1/Source1/Citation1。新しいroot全graph backupと実planは承認後の未完項目である。

今回の検証は14（時刻/trust/監査/鍵）＋3（使捨てroot FS・暗号化・部分rollback）＋27（executor）＋18（棚卸し/candidate）＋16（試験guard）＝78件成功。root FS試験のDocker/HTTPはmockであり、新固定版の実VPS結合成功とは数えない。既存の専用DB単回apply/復旧試験を再実施していない。

ops/文書だけの変更なのでWeb再buildは行っていない。local3200 /api/datasetは200（revision82b01515…）、正式VPSは200（88437056…）、日常betaは403で確認不可。検索UI・会員DB・サービス設定は変更していない。

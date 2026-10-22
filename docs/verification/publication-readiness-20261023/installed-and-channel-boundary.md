# 両側の固定版導入と、実receipt照合時の通信境界

VPSは運営者の再開入口実行で readiness-installed-disabled が成功。source9b59669、image manifest367e9c…、本番false/apply0、root stage /root/plunode-publication-readiness.5ih89_06。固定11 programを独立SSHでSHA/所有root/単一link/mode照合し一致した。readonly入口へのexecute要求はforced parserが拒否した。秘密鍵・PG・サービス設定変更はない。

最新公開KG backup、setup/installation、readiness closure public key、暗号化VPS backupをSFTPで受領。closure public SHA8698baae…、VPS暗号化backup SHA9fc192a1…を運営者出力と照合。rootの公開base/revisionはmanga-issue-25-utc-recovery-08-normal/88437056…を維持する。

WSLも運営者の入力でsource9b59669の固定snapshot/clientと暗号化backup生成・復号一致を完了。WSL暗号化backup SHAaafd901c…、root stage /root/plunode-publication-readiness.cscw0z40。暗号化fileだけをrootから受領し、権限を落としたuser processでcacheへ排他的に保存した。秘密鍵/phraseは出力しない。PC/VPS外保管はまだ運営者確認待ちである。

WSL snapshotの照合でumask077により各fileが600となる配置不具合を検出した。archive SHAa59f9971…を固定照合し、全1450 fileのbytes/owner/link・全親directoryをrootで確認してから、snapshot内の公開Gitコードだけを予定の644へfchmod/fsyncした。private key・live Worker・旧snapshotを変更せず、再暗号化や再導入を求めていない。将来のinstallerにも明示fchmodを追加し、root使捨てFS試験で通常UID向けmodeを検査する。

新backupから既存publication-cycleと固定imageのNode validator/backup-planを使って正式未公開1 Claim/1 Source/1 Citation・Entity追加0の候補を作成した。releaseはmanga-issue-34-obata-drawing-20261023。既公開50 Claimを再受入/再公開せず、updated=[]、relationshipsAdded=4。これは候補/無書込planであり、公開署名は発行していない。

候補artifact SHAd83660e0…をreadonly VPSへuploadしてfreezeし、nonce82da68d6-c3a1-4ff7-85d3-24ab2df1b16d/ticket f2bd0f98-ef1d-40be-923f-381c9accf399/generation1をarm。shadow Worker/local bare Gitだけへpause-newを記録し、実Worker tick/parserでACK・両flock・control hashを確認。live Workerのpause/state/cacheは変更していない。WSLには別のreadiness closure公開pinだけをroot所有で追加した。

固定WSL CLIの実SSH preflightはBrokenPipeで停止した。rootCLIの待ち時間は固定15秒だった一方、全10正式receiptの元固定freshness処理は実測24.773秒で成功した。時刻のread-only測定はVPS−WSLの可能範囲−0.236〜+0.229秒で0を含む。公開データや根拠不一致ではなく、短すぎる受信待ちである。ticket/frozen・shadow pauseを保全し、別nonceへ逃げず同じ位置から再開する。

修正は、既存challengeのexpiresAtまでの残り時間（最大60秒）をmonotonic全体予算として使い、部分送信ごとに期限を更新しないこと。期限/署名/nonce/receipt/plan検査を緩めない。従来のselect後readlineによる部分行の無期限待ちも避け、EOF/oversize/複数行/時計jump/期限切れを拒否する。

VPS更新はexecutorとprogram manifestの2 fileだけ。同じops image/attester peer9b59669を用い、manifestにpeerSourceCommitを明記する。既存VPS共通lockとreadiness operation.lockをnonblockingで取得し、旧11 hash・本番false・既知open ticket・production予約なしを検証して旧bytesを保全。frozen/jobs/config/reservation/exclusionの前後SHA不変を必須とし、key/image/Worker/DB/serviceを変えない。root sudo実行だけ運営者が必要で、既定範囲の再承認ではない。

復旧は同じroot update stageのupdaterに--rollbackを渡す。現在のprogramが既知の新旧SHAであり本番falseである場合だけ旧executor/manifestを復元し、途中prefix復元にも対応する。ticketやnonceをresetせず、全状態の前後不変を検査する。自動rollback・apply/restoreは行わない。

焦点検証: wire7件（25秒応答の仮想時計、残時間、部分行、期限/EOF/oversize/追加行、実pipe成功・期限切れ）、root使捨て更新/途中rollback/競合拒否2件、snapshot mode回帰を含むroot FS3件が成功。完了済みの専用DB単回apply/復旧試験を繰り返していない。新版root配布と実peer成功は次の運営者sudo実行結果後に確認する。

最終目標は公開承認後の転送〜単回apply〜結果記録の自動完結で、まだ未達。本番有効化・実データapplyは別の個別承認まで実行しない。

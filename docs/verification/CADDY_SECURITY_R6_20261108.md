# R6 Caddy security補修・最終確認（2026-11-08）

**TCP・Caddy補修と最終確認済み｜R6の残作業なし｜全体はR6まで完了。** Caddyは公式stable `2.11.9` で稼働。Web app14542c72／build `wFBq24bSaSp0W-_ZOFaXr` は維持。以下の準備・未実施記述は各時点の履歴で、最終結果は末尾を優先する。

## 実物と判断

kernel補修後、Ubuntu公式client `pro security-status --format json` で標準security0、ESM Apps1を確認した。対象は現在稼働・有効のCaddy `2.6.2-6ubuntu0.24.04.3`、ESM候補は同版の `+esm2`。Ubuntu Proは未接続。通常APT候補0をこの更新なしと解釈しない。

追加のアカウント・契約を増やさず保守するため、[Caddy公式のUbuntu向けstable配布](https://caddyserver.com/docs/install#debian-ubuntu-raspbian)へ移す。新規の有料サービスやPro／Livepatchは有効化しない。公式最新stable [v2.11.9](https://github.com/caddyserver/caddy/releases/tag/v2.11.9)（11月5日公開）はsecurity修正を含む。Ubuntuのbackport版とupstreamの番号だけを比較してCVE修正を断定せず、公式security releaseと実機の適用・起動・設定保持を確認する。

## 固定資材と準備検証

- Caddy署名付きInRelease→Packages.gzのSHA256→DebのSHA256を連鎖して照合。署名key fingerprint `2F5C3BE9886ACD2913299EFBABA1F9B8875A6661`。
- 新Deb `caddy=2.11.9`、amd64、18,049,414bytes、SHA256 `bbea4aeaadc86b233c168cc33bad9daa1cbce756dc08949b783b45398f8e65cb`。同梱Goは1.27.3。
- 復旧用の現行Ubuntu Deb `2.6.2-6ubuntu0.24.04.3`、SHA256 `3a71aa97c7d85ea7a285717601306bf45d6f701073875ab689e893fabf6a819c` を取得・照合。
- 別のlocalhost listener・admin API無効・一時storageでcandidateを起動し、HTTP転送時のpath／query／header保持を確認。既存localhost:3200／HTTPS βは変更しない。
- VPSの非特権APT simulateでCaddy1更新、新規0、削除0、他162package未変更を確認。4境界テストで追加package／削除／別版を拒否する。
- `/etc/caddy/Caddyfile` はSHA256 `71b8724665f8ea0207e61f72d741740a812550ca005950583fe009957bee9334`。import先 `graph-knowledge.caddy` はdevelopから読めないため、**実機の完全な設定同等性・service accountでのvalidateはsudo実行時の適用前検査に残す**。通過済みとは扱わない。

## 実行時の保全と境界

`scripts/remediate-caddy-production.py` は稼働kernel149、現行Caddy版、Compose／正式build／Caddyfile hashを照合する。Caddy設定・証明書store・unit／overrideをroot-privateへbackupし、既存復旧公開鍵で暗号化・復号照合してPC取得用の暗号化ファイルだけをexportする。

署名・固定assetを再検査し、新旧binaryの実Caddyfile adapt結果の同一性と既存service accountでのvalidateを確認してから、Caddy1packageだけを更新する。既存のservice capability・NoNewPrivileges・ProtectSystem／Home・PrivateTmpはlocal overrideで保持し、vendor既定による権限拡大を避ける。Caddy API用の別serviceは起動しない。

稼働binary／package版、正式HTTPS、既存設定hash、Dockerの同一container／image・稼働状態を確認する。アプリ・DB・Workerの更新やhost再起動は行わない。失敗時はCaddyだけを元Debへ戻し、現行の会員DB／知識DBや旧Webへは復元／downgradeしない。設定不一致やvalidate失敗はpackage適用前に停止する。

成功後、公式のsigned-by付きstable repositoryをCaddy保守用に登録しAPT metadataを更新する。元のUbuntu sourceを置き換えず、testing／proposed repository・別の課金サービスは追加しない。registryの更新失敗を隠して全完了とは報告しない。実行後にpackage／実稼働binary／正式URL／公式診断／backupの結果を追記する。

## 正式適用・最終確認（20:14以降 JST）

本人のsudo実行は成功。実Caddyfileの新旧adapt同一、既存service accountのvalidateを通り、Caddy1packageを2.11.9へ更新した。設定・TLS storeを保持し、既存capabilityとNoNewPrivileges／ProtectSystem／ProtectHome／PrivateTmpを保持。Docker container／imageとapp buildは不変、host再起動・DB migrationなし。公式stable sourceの登録とmetadata更新も成功した。

- 実機：`caddy version` はv2.11.9、dpkg版2.11.9、Caddy active。APT候補も署名付きCaddy公式stableの2.11.9。kernelは149のまま、boot ID `11540757-bb62-4ef1-8b90-0397cd5cf6cb` はCaddy更新前後で不変。dpkg auditは空。
- Ubuntu `pro security-status --format json`：標準security0、ESM Apps0、ESM Infra0、reboot不要。Pro契約／Livepatchは未有効化。Caddyは公式配布で保守する。これは全ソフトウェアに未修正CVEがないことを保証する診断ではない。
- 正式TOP／dataset／PLUTO検索／共通知識status／Theme構成版3（4 Record）／共有API（内容版3）／OGP画像は200。HTTP/2を明示したcurlも `2 200`。MCPへの未認証POST initializeは401と認証challengeを返し、認証境界を保持。GETの405を認証失敗と誤解しない。
- OGP画像は112,843bytes、SHA256 `676b8e65cc1466b65c54dcc73f6bd9833a965de09cf96e2c5546b1e7ea90e17d` で更新前と一致。実SNSカード／本人のGoogle再ログイン／実iPhone操作は今回繰り返していない。アプリ変更なしのため既存の正式受入結果を再利用する。
- origin IPへのTLS接続を正式SNIで検証し、leaf SHA256 `4fcc8e64e3d864e8066cb1d5f160b43c64287b498d7168eda0c0c304233d41a2` がbackup内の既存証明書と一致した。review／publisher／patrolの各プロセスも継続稼働。
- backup `/opt/graph-knowledge/backups/caddy-security-20261108T111426Z`。暗号化archive SHA256 `fa7640f07eb385c8911ad0257e6a7d56128d14a00d2128276feeb6ba74fd3257`、wrapped key `cb6bbed75ba1bb259698da1bd6a6dc169d7f207ac7915719cde16bc1e188e712`。PCへ取得してhash・復号・45 archive member全読取・設定／証明書store収録と証明書一致を確認。一時復号データは削除した。
- 3200／HTTPS β／正式のdatasetはすべて200。3200／βは同app14542c72・build `J8c0xCK92ByIAFgkz3nbx`、正式は同app・build `wFBq24bSaSp0W-_ZOFaXr`。今回のWeb再buildは不要で実施していない。

証跡は作業tree `.local/caddy-security-20261108/` の `activation.log`、`post-update.json`、`formal-http.json`、`mcp-auth-check.json`、`environment-health.json`、`backup-verification.json`。暗号化backupのみをPCへ保存し、秘密値をGitやIssueへ出さない。

### 本件外のfailed unit

20:15の一覧に `resale-ebay-notifications-monitor.service` のfailedを1件検出した。`ExecMainStatus=1`、開始／終了は20:06:52であり、Caddy適用20:14:26より前。原因は未調査。設定変更・再起動・failed状態のresetは行っていない。Plunodeのサービス・正式APIの復帰結果と区別し、VPS全サービスが無障害とする報告はしない。

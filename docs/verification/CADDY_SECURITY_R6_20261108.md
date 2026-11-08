# R6 Caddy security補修の準備（2026-11-08）

**TCP補修済み・Caddy補修準備中｜残りはCaddy適用・正式確認｜全体はR6まで。** Caddy packageはまだ変更していない。現在の正式サイトは既存Caddyで稼働し、Web app14542c72／build `wFBq24bSaSp0W-_ZOFaXr` を維持する。

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

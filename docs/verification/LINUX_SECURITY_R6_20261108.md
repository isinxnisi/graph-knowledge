# R6 Linux TCP脆弱性の見落とし・訂正と補修（2026-11-08）

**TCP・Caddy補修と正式復帰確認済み｜R6の残作業なし｜全体はR6まで完了。** アプリの正式公開と代表操作の受入に加え、稼働修正版・公式診断の標準／ESM更新0件、設定／証明書とbackup保全を確認。[Caddyの固定補修計画](CADDY_SECURITY_R6_20261108.md)。以下の未実施記述は適用準備時点の履歴で、実施結果は末尾を優先する。

## 見落としと訂正

前回の `prepare-knowledge-production.py` は、同じpackage名の新しい版のうち `Ubuntu / *-security` にあるものだけを数えた。その集計0件をLinux対応済みと判断した。`-updates` の修正や新しいABIのkernel依存package、実際に稼働中のkernelに対する重要CVEの照合を行っておらず、検査方法と完了判断が不十分だった。ユーザーのSSHログイン表示とTCP脆弱性の指摘を受けて再確認した。

## 実機の読み取り確認（19:32〜19:36 JST）

- Ubuntu 24.04、稼働kernel `6.8.0-147-generic`。`linux-image-6.8.0-147-generic` と `linux-virtual` 系metaは `6.8.0-147.147`。
- Livepatch executableはなし。`reboot-required` はなしだが、未更新なので修正適用の証拠にならない。
- 実機APTでは `6.8.0-149.149` がUbuntu `noble-updates/main` にあり、未導入。`apt-get --simulate upgrade` はkernel追従metaを保留する。
- 既存 `linux-virtual` を固定版149へ更新するsimulateは、6更新＋4新規＝10package、削除0。無関係なWeb／Docker／OS packageは更新しない。
- `/boot` 空き703MiB、root空き121GiB。DKMSなし、Secure Boot非対応という実機応答を確認した。
- ログインの182更新／標準security1件の表示と、限定的な集計0件は同じ指標ではない。表示を理由に一括182件を更新したり、0件を理由に安全と扱ったりしない。

## CVEと修正根拠

[Ubuntu CVE-2026-98432](https://ubuntu.com/security/CVE-2026-98432) はIPv4 TCPに関するCritical／CVSS9.8。11月7日更新の表はNoble修正を149でwork in progressと表示する一方、[11月2日のCanonical案内](https://ubuntu.com/blog/fixes-available-in-proposed-pocket-for-cve-2026-98432) は149に修正を収録しproposedで提供、試験後updatesへ移すと案内している。実機で11月8日に取得できる候補はupdatesであり、試験repositoryを追加する必要はない。

[公式linux 6.8.0-149.149 changelog](https://changelogs.ubuntu.com/changelogs/pool/main/l/linux/linux_6.8.0-149.149/changelog) をVPSから取得し、149の項目に `ipv4: free inet_opt and ireq_opt after an RCU grace period` を確認した。これはCVE公式ページに記載された修正に対応する。Web上の状態表と配布状態の時点差は残して記録する。147の稼働を修正済みとは扱わない。MPTCP停止だけを修正の代替にしない。

## 更新と復帰の範囲

`scripts/remediate-linux-kernel-production.py` は、稼働147／Ubuntu24.04／現行Compose hash／正式build／APT状態／boot空き／既存kernel保持／通常GRUB選択／コンテナの再起動設定を照合する。現行構成と会員・知識DBの各オンラインdumpをroot-privateにbackupし、既存の復旧公開鍵で暗号化・復号hash確認する。各dumpは個別に整合した断面であり、両DB共通の書込停止断面ではない。OS更新の失敗時に古いdumpを本番へ自動復元しない。

APT metadataを再取得し、10packageすべてが固定版149・信頼されたUbuntu updates/security由来であることと、simulateの完全一致を確認してから適用する。対象外の依存更新・削除・候補差異は停止する。旧147のkernelを削除せず、GRUB／initrdと導入結果を確認して15秒後の再起動を予約する。この段階の結果は `remediationVerified: false` であり、適用完了と稼働反映を区別する。

再起動後は、SSH再接続、boot IDの変化、`uname -r = 6.8.0-149-generic`、package版、Docker／PG／Neo4j／Web／3 Worker、正式buildと既存設定hash、正式Theme／共有／通常Graphの応答を確認する。その後に当CVEの稼働修正を完了扱いする。VPSのconsole復旧が必要になった場合はその旨を明示し、旧アプリやDB dumpへ機械的に戻さない。

## 検証と保存先

10packageの実機simulateと、対象外サービス更新・削除・別版・依存欠落・重複actionを拒否する6境界テストを用いる。実機でpackageをまだ変更していないため、インストール・再起動後の稼働は未確認。現況JSONは作業treeの `.local/linux-security-20261108/` に保持する。

localhost:3200／HTTPS β／正式アプリはapp14542c72のまま。今回の変更はOS補修用手順・判定の訂正で、Web再build・DB migration・テストデータ投入は行わない。標準サポート外のESM2件、全ソフトウェアに未修正CVEがないこと、無関係な機能更新の一括適用はこの限定補修の確認結果と混同しない。Linux対応の最終結果は適用後に追記する。

## 本人実行後の実機確認（19:45〜19:48 JST）

- 固定10packageをすべて `6.8.0-149.149` へ導入。再起動後の `uname -r` は `6.8.0-149-generic`。boot IDは `805499be-d5fe-4fe5-b36a-50df00cc5740` から `11540757-bb62-4ef1-8b90-0397cd5cf6cb` へ変化した。旧147のkernelは保持。dpkg auditは空、reboot-requiredなし、Docker active、failed systemd unitは0。
- `/api/knowledge/public?mode=status` とTheme構成版3、旧KGのPLUTO検索、公開共有APIが200。共有内容版3とOGP画像を読め、OGPは更新前と同じ112,843bytes・SHA256 `676b8e65cc1466b65c54dcc73f6bd9833a965de09cf96e2c5546b1e7ea90e17d`。新共通知識のNeo4j投影と会員PGの実読取を確認。review／publisher／patrolの各Nodeプロセスも復帰した。新しい実AI処理を検証のためだけに発生させていない。
- backup `/opt/graph-knowledge/backups/linux-security-20261108T104512Z`。暗号化archive SHA256 `aa1a7a219fd9eed44da44700fb88e55ed9fcad29a0dc14aed6ebe6b7a84fcee6`、wrapped key `8c5d4b468f6ad7d934ffc980757118cb093942be9e33bc1b72a4d4e3b3621b04`。PCへ取得してhash・復号・tar全読取と両dumpのPGDMP形式を確認。会員dump SHA256 `2d635fce21d6e48e317ef100e7c864d48feffdfb8cc5cee7176c97701dc47b11`、知識dump `25ce1978fce1d9ca650b1e2be59f6c245460ab0a775897a75e4c465a2bcab35e`。一時復号データは削除した。今回DB復元を繰り返したわけではなく、既存の復元検証を再利用する。
- `pro security-status --format json` は標準security更新0、ESM Infra0、ESM Apps1。残りは稼働中のCaddy `2.6.2-6ubuntu0.24.04.3` に対する `2.6.2-6ubuntu0.24.04.3+esm2`。Ubuntu Proは未接続。古いログインbannerの件数を現在の結果に代えない。今回のTCP補修を、残るCaddyや全ソフトウェアの脆弱性不存在の確認と混同しない。

## Caddy補修後の完了判定

20:14のCaddy公式2.11.9への適用と、正式HTTPS／HTTP2・実API／認証境界・3 Worker・backupのPC復号／証明書保持を確認。Ubuntu診断の標準／ESM Apps／ESM Infraはいずれも0件。今回公開工程で残っていたTCP／Caddy補修を完了した。[Caddyの実測・限界・別件unit](CADDY_SECURITY_R6_20261108.md)を参照する。通常の全package更新やOS release-upgradeは行っていない。Caddy以外の第三者packageも含めた全CVE不存在の保証とはしない。

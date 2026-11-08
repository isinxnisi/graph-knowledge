# R6 Linux TCP脆弱性の見落とし・訂正と補修（2026-11-08）

**R6のLinux補修中｜残りは固定kernel更新・再起動・正式サービス復帰確認｜全体はR6まで。** アプリの正式公開と代表操作の受入は保持するが、R6全体の完了報告は撤回する。OSのpackage変更・再起動は、現時点では未実施。

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

# HTTPS βの接続復旧（2026-11-10）

①障害確認・②既存サービス復帰・③HTTPSと390px表示を確認。本番VPS・UI buildは変更していない。

UbuntuのI/OエラーとDocker停止を伴う502だった。通常停止の失敗後にDockerとWSLを再起動し、既存launcherで再開した。DB・設定・モデル・作業ファイルの削除や初期化は行っていない。

private設定21ファイルのhashが前回切替時と一致。β Webと既存5 Workerが稼働。会員PGと共有Kevはhealthy。cloudflared-resale-researchはHTTP/2で4接続を登録。WindowsのHTTPS要求は200。Chromeの502タブも再読込でテーマ本文・挿絵・年表・図を表示し、390px幅でも確認した。iPhone実機の4Gは本人側の再読込確認が必要。

source f6c92274、build yBSq7WA2LKbpeks4fN_hQを継続。今回の変更は記録のみ。C空きは最初約5.9GB、復旧後約3.9GB。Ubuntu rootは17%使用。根本の発生要因は未特定で、容量不足やスマホ固有とは断定しない。

確認先：https://graph-beta.isinxnisi.com/t/reading-20261110%3Awebb%3Atheme?krev=3&kview=split

実画面：C:/Users/nishr/.codex/tmp/plunode-beta-recovered-20261110-mobile.png

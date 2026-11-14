# 受入済みβ機能の正式反映（2026-11-14）

## 範囲と現在地

①監査・②固定資材／隔離試験・③本番backup／隔離復元／PC回収復号まで完了。④本番切替は既存sudoの本人入力待ち。⑤正式URL／既存App更新は未実施。本番Web／DB／Workerは従来版のまま。
ユーザーの今回の公開指示に基づく機能更新であり、βのテーマ・Record・会員・商品・画像・品質ガイド本文を移行しない。未受入自動成果は0件、追跡対象の開始時HEADはa7174d50。既存の非追跡.local／memo.txtは変更・削除しない。

## 実機の監査

Webは39a84f4e／build `7EFviEW9P6SUyGSaqGPRm`、opsはa9f2deaa。会員ledger39（000〜038）／知識9。会員86表・知識33表。Google／会員／運営／テーマ登録は既存構成を維持する。品質ガイドの表はまだなく、本文登録0件。稼働kernelは6.8.0-149-genericで、今回OSの更新・CVE再評価は行わない。

WSLからのTCP22はtimeout、Windows経由では成功。鍵とknown_hostsの照合はWSLのOpenSSHを継続し、通信だけ固定VPS宛のWindows stdio transportを使用する。DNS・OS・認証条件を変更しない。sudoは本人の既存パスワード入力が必要。非秘密監査はscripts/inspect-accepted-beta-production.py、詳細出力はGit外のprivate backupに保存する。

## 固定アプリ資材

受入済みa7174d50に、正式imageの構築入力だけを補修した `4ccb98f5e6e074d9c604024bc84d1d20f3a22323` を候補とする。Web／knowledge-opsは同じsource・linux/amd64、OCI revision labelとarchiveのconfig／manifest／layersを照合する。

新しい静的編集カタログが従来Dockerのallowlistに存在しなかったため、空の正式catalogueを明示COPYする。βの商品・編集内容や挿絵をbuildへ含めない。本番に登録済みの動的データはDBから引き続き読む。空配列の型推論を明示して本番の型検査を維持し、ignoreBuildErrors等は使わない。βの内容・表示は変更しない。

## 更新計画

- 会員039商品画像、040テーマ挿絵参照、041品質ガイド、042受付項目改訂、043項目再試行を追加。既存checksumを維持する。知識migrationは追加しない。
- Webとknowledge-review／patrol／publisherを切替。member-ops／knowledge-opsのimage参照も同じ固定opsに揃える。DB／Neo4j／旧KG opsのimage・container・認証は保持する。
- private設定、Worker資格、AI利用上限・予定・共通Kev・教育artifactは変更しない。Webとreviewの既存運営資格とtheme flagを切替前に照合する。
- 商品画像は039のbyteaで永続化され、DB backupに含む。Workerの未参照素材整理は過去版参照を維持して7日の猶予と既存排他を使う。別画像volumeや外部サービス契約は不要。
- prepareはexported snapshotで会員dumpと照合値を固定し、隔離PGで復元・追加migration・旧列／owner保全・再実行を確認する。正式Webは停止しない。旧Web／ops imageも保存する。
- activateは現行baselineを再照合してWebと3書込Workerを停止し、最新の会員／知識dump・checkpoint・private資材をbackup／暗号化検証してからmigration・切替する。β seedや本文投入は実行しない。
- migration開始後に失敗した場合、旧dump上書きや旧Webへの自動downgradeをしない。書込側を停止して現DBを保ち、対応版による修復を行う。migration前の失敗では従来サービスを再開する。

## 検証と残件

関連unit50件成功。隔離DB試験は初回、共有DBの版数干渉と5秒timeoutがあったため、ファイルごとにDBを作り直し、30秒上限で再実行して36件成功（項目改訂8・再試行10・登録／読み物18）。実PLUTO／黒澤の読取exportは隔離DBだけで使用し、正式へコピーしない。releaseのchecksum逸脱・未計画migration・owner／旧列保全・移行結果不明時の旧Web再開禁止をPython4件で確認した。

本番のApp更新、更新後の実読取、正式画面・認証・SEOは切替後まで未完了。準備backupのPC復号は完了し、切替時の最新backupは別途確認する。更新系の正式実書込みは今回行わず、隔離試験と明確に区別する。iPhone実機、特にスクロール時ちらつきの消失は未確認。PCのviewport検証を実機成功としない。

旧Web／opsのimage archiveは正式VPSのroot-private backupへ保存してhashを記録する。PCへ回収する暗号化archiveはDB・設定・checkpoint・image識別情報を含み、巨大な公開image本体は重複転送しない。復号鍵はPCの0600ファイルとして保持し、公開鍵だけをVPSへ渡す。

## 固定資材の検証（切替前）

Web／ops source `4ccb98f5e6e074d9c604024bc84d1d20f3a22323`、正式候補build `fqo_VSttPZ8pGBpd4b-Ih`。Dockerの型検査込みbuild成功。archive 592,676,682 bytes、SHA256 `6f6568f33f106839338276f607c65def46b7e5202f2084a5f87a86a8ce878970`。同一のarchive検査器でconfig・manifest・全layer・source labelを検証済み。AI artifactのhashも現本番と一致する。

追加039〜043以外の会員39／知識9のchecksumはすべて一致。正式用ops imageを使ったローカルの別PGで、旧86表／39件からsnapshot backup→別DB復元→100表／44件→再実行まで成功。旧列の内容・所有者保持、品質ガイド本文0件。最初に隔離DBの接続文字列が正式用条件に合わず停止したが、試験専用文字列を補修して再検証した。本番実データでも同じ復元検証に成功した（下記）。切替成功を意味しない。

## 本番backupの復元・PC復号（切替前）

本人によるrun-preparation.pyの実行成功を受領。正式Webを停止せずexported snapshotから会員86表をbackupし、隔離DBで100表／ledger44への追加039〜043と再実行を確認した。旧列・所有者を保持し、品質ガイド本文は未投入。本番DBのmigration・設定変更・切替は未実施。

準備backupは `/opt/graph-knowledge/backups/accepted-beta-preparation-20261114T081944Z`。旧image archiveのSHA256は `6e2dd4c57f011481617be0b3497106efd7aa2cab7b1ab604438f4c313112e45f`。暗号化archive 402,401,312 bytesとwrapped keyをPCへ回収し、受領hashの一致・ローカル秘密鍵による復号・tar全体19ファイルの読み取りを確認した。秘密設定は展開・表示せずstreamで照合し、一時復号鍵は削除した。

会員dump 11,628,471 bytes、SHA256 `77e29a221049bc749b937d06a7a1b7285ce8718ded821c02c806d51c1ec89f17`。知識dump 390,646,057 bytes、SHA256 `cca43ffa2a96ac43ca42a727f92caad36bcd3e4826be6ac59e67ab0a43a2a653`。manifestの固定sourceとbaseline86表、DB・Compose・private設定・checkpoint・image識別情報の収容を確認済み。

## 本人操作待ちの再開点

同じ固定資材の `backups/accepted-beta-production-20261114/run-release.py` を本人へ提示済み。結果待ちであり、本番は従来source39a84f4e／会員39・知識9のまま。実行は現行再照合、Web／3 Worker停止、最新backup、migration、固定Web／ops切替を行う。成功後、activated receiptと最新backup、正式URL、既存本番Appの定義更新・読み取りを確認する。準備済みroot stageは変更しない。手動holdが解放済みなら本人helperは共通guardを取得する。

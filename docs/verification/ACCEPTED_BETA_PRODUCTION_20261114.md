# 受入済みβ機能の正式反映（2026-11-14）

## 範囲と現在地

監査完了、固定資材を構築中。まだ本番のWeb／DB／Workerを変更していない。
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

関連unit50件成功。隔離DB試験は初回、共有DBの版数干渉と5秒timeoutがあったため、ファイルごとにDBを作り直し、30秒上限で再実行する。実PLUTO／黒澤の読取exportは隔離DBだけで使用し、正式へコピーしない。releaseのchecksum逸脱・未計画migration・owner／旧列保全・移行結果不明時の旧Web再開禁止をPython4件で確認した。

本番のApp更新、実読取、正式画面・認証・SEO、暗号化backupのPC復号は切替後まで未完了。更新系の正式実書込みは今回行わず、隔離試験と明確に区別する。iPhone実機、特にスクロール時ちらつきの消失は未確認。PCのviewport検証を実機成功としない。

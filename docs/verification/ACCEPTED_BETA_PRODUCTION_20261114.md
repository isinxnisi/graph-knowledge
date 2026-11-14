# 受入済みβ機能の正式反映（2026-11-14）

## 範囲と現在地

①監査・②固定資材／隔離試験・③本番backup／隔離復元／PC回収復号・④本番切替・⑤正式URL／既存Appの受入まで完了。本番sourceは4ccb98f5、会員ledger44／知識9。以下の初期監査・資材準備は切替前の記録。
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

本番App更新・実読取、正式画面・認証・SEO、準備／切替時の最新backupのPC復号まで確認した（最終結果は後段）。更新系の正式実書込みは今回行わず、隔離試験と明確に区別する。iPhone実機、特にスクロール時ちらつきの消失は未確認。PCのviewport検証を実機成功としない。

旧Web／opsのimage archiveは正式VPSのroot-private backupへ保存してhashを記録する。PCへ回収する暗号化archiveはDB・設定・checkpoint・image識別情報を含み、巨大な公開image本体は重複転送しない。復号鍵はPCの0600ファイルとして保持し、公開鍵だけをVPSへ渡す。

## 固定資材の検証（切替前）

Web／ops source `4ccb98f5e6e074d9c604024bc84d1d20f3a22323`、正式候補build `fqo_VSttPZ8pGBpd4b-Ih`。Dockerの型検査込みbuild成功。archive 592,676,682 bytes、SHA256 `6f6568f33f106839338276f607c65def46b7e5202f2084a5f87a86a8ce878970`。同一のarchive検査器でconfig・manifest・全layer・source labelを検証済み。AI artifactのhashも現本番と一致する。

追加039〜043以外の会員39／知識9のchecksumはすべて一致。正式用ops imageを使ったローカルの別PGで、旧86表／39件からsnapshot backup→別DB復元→100表／44件→再実行まで成功。旧列の内容・所有者保持、品質ガイド本文0件。最初に隔離DBの接続文字列が正式用条件に合わず停止したが、試験専用文字列を補修して再検証した。本番実データでも同じ復元検証に成功した（下記）。切替成功を意味しない。

## 本番backupの復元・PC復号（切替前）

本人によるrun-preparation.pyの実行成功を受領。正式Webを停止せずexported snapshotから会員86表をbackupし、隔離DBで100表／ledger44への追加039〜043と再実行を確認した。旧列・所有者を保持し、品質ガイド本文は未投入。本番DBのmigration・設定変更・切替は未実施。

準備backupは `/opt/graph-knowledge/backups/accepted-beta-preparation-20261114T081944Z`。旧image archiveのSHA256は `6e2dd4c57f011481617be0b3497106efd7aa2cab7b1ab604438f4c313112e45f`。暗号化archive 402,401,312 bytesとwrapped keyをPCへ回収し、受領hashの一致・ローカル秘密鍵による復号・tar全体19ファイルの読み取りを確認した。秘密設定は展開・表示せずstreamで照合し、一時復号鍵は削除した。

会員dump 11,628,471 bytes、SHA256 `77e29a221049bc749b937d06a7a1b7285ce8718ded821c02c806d51c1ec89f17`。知識dump 390,646,057 bytes、SHA256 `cca43ffa2a96ac43ca42a727f92caad36bcd3e4826be6ac59e67ab0a43a2a653`。manifestの固定sourceとbaseline86表、DB・Compose・private設定・checkpoint・image識別情報の収容を確認済み。

## 切替結果と二度目の実行停止

VPSのactivated receiptは2026-11-14 17:39 JSTに切替完了。source `4ccb98f5e6e074d9c604024bc84d1d20f3a22323`、build `fqo_VSttPZ8pGBpd4b-Ih`、会員44／知識9。Web・knowledge-review／patrol／publisherを更新し、member-ops／knowledge-opsのimage参照も固定opsへ揃えた。旧列・所有者と切替時の知識tupleを照合保全し、設定・PG／Neo4j containerを保持。βデータ／ガイド本文／OSの変更なし。

17:43 JSTの提示ログは、すでに切替済みのcomposeを旧監査hashと再照合して止まった二度目の実行。最初は失敗ログだけから未切替と説明したが、既存のactivated receipt・実稼働build・本番Appの読取で訂正した。照合を緩めたり旧composeへ戻したり、migrationを再実行する必要はない。再開判断ではactivate.log一つだけでなく、完了receiptと実稼働版を先に照合する。

切替直前backup `/opt/graph-knowledge/backups/accepted-beta-release-20261114T083759Z`。暗号化archiveのSHA256は `c49ee3a219d582cd4c713b34e69193eb68ab69cdf0d9025cfed4daac3dc6237e`、wrapped keyは `ab8c349a6c6e9d99a3e8ae259e5fcf22903bbed40090e16ddc8b827b903117c3`。402,401,312 bytesをPCへ回収し、hash一致・秘密鍵復号・18ファイル全体のstream読取、member baseline86表とmanifestのsourceを確認。一時復号鍵は削除。DB／設定／checkpointはroot-privateとPC暗号化backupの両方にあり、旧image本体は準備backupに保持する。移行後DBへ旧dumpを自動上書きせず、対応するWeb／opsで整合修復する。

## 正式URLの最終確認

- `/api/publication/compatibility` の実buildが固定buildと一致、公開KGのrevision `f5dbf83f-c89e-4e40-95ee-57957016089f` を維持。外側HTTPSも200・TLS検証0。
- TOP・テーマ検索一覧・Webbテーマ17版の年表／Graph／Record詳細、本線PLUTO探索（4 Entity／6 Claim／3 Relation）とEntity詳細をブラウザで確認。初回左ペイン閉鎖、メインとフッターのdocumentスクロールを維持。
- 375×812のPCブラウザviewportで、詳細の右重ね開閉、別Record選択、ヘッダ／下部タブ維持を確認。背景はx0・幅375・ヘッダ下から759px全高。年表は高さ804／scrollHeight804・overflow visibleで部分スクロールなし。Graphの明示クリック解除→再ロックと、ロック中も表示操作が有効であることを確認。viewportは確認後reset。iPhone実機の試験ではない。
- Google既存アカウントから正式callbackを経てログイン成功。既存アカウントCapsule5件、Webb固定保存と内容版3の有効な既存共有URLを表示確認。編集・保存・共有更新・コメント送信はしない。
- Webのcanonical／OG URLはplunode.net、robotsはindex, follow、sitemapは正式テーマのja/en URLを含む。TOP／テーマ17版／PLUTOのOG画像は実HTTP200・PNG1200×630（51,247／67,123／37,771 bytes）。β noindexは持ち込まない。
- 旧Webb17版のread_theme.themeとsnapshotは切替前後でdeep equal（23 Record）。stories未設定はlegacyとして保持。明示選択／0件／順序／グループと商品の二種の範囲は隔離試験で検証済み。本番にはβの商品・画像・編集本文を投入していないため、実画像入りの新商品カードを正式データで新規作成する試験は対象外。
- 既存の収集予定／private profile／AI利用上限／共通Kev／AI教育artifactは変更しない。Workerは切替時の起動・readiness確認済み。予定の実発火を起こす書込操作は行わない。

確認画面はCodex visualizationsのaccepted-beta-production-20261114に保存：before-home.png、after-home.png、after-theme-desktop.png、after-theme-mobile-detail.png、after-home-authenticated.png、after-app-tools.png。

## 既存正式ChatGPT App

既存App `asdk_app_6aeffba90628819181cfb1d6eb54a8d0` と正式endpoint `/api/knowledge-collection/mcp`、Primary接続を維持。管理画面からツールを更新し、プラグインの操作一覧でWrite16／Read12の28操作を確認した。項目修正／再試行、商品／添付画像／品質ガイドの読み書き、update_themeのchanges.storiesとread_theme.storyEditingを含む。再作成・別App・権限緩和・新OAuth同意なし。

同じ接続からget_theme_authoring_guide／read_themeを呼び、stories候補・正確な版・商品画像schemaを取得。更新後に新しく公開されたread_theme_quality_guideも実呼出しし、revision0／Markdown null／history[]を確認。ガイド本文は未登録であり、別途運営から正式本文を登録する必要がある。βの本文はコピーしない。

本番更新系の操作は定義の確認のみ。実書込みは隔離試験で確認し、本番での新規テーマ・商品・画像・読み物編集・手動再試行は実行していない。運営AI送信0／一般投稿の既存審査維持は隔離回帰で確認した。

## 残る確認と非対象

- iPhone実機（特にスクロール時のGraphちらつき）の消失は未確認。PC viewport検証と分ける。
- 本番更新系の実書込みと、新しい画像・商品・明示storiesを本番実データへ登録する試験は未実施。今回の禁止範囲を守り、隔離データで契約を確認した。
- 品質ガイド本文は0版。今回の機能配置とは別の正式本文登録が必要。
- β制作のPLUTO／黒澤テーマや商品・画像・記事の公開は別工程。登録済みコンテンツを移すことはしていない。

ローカル3200とHTTPS βは `iRQvd9tnLyUJ-K0fNAJOa` のままHTTPで確認。今回の追加は正式受入の記録のみであり、βの不要な再build／再配置は行っていない。

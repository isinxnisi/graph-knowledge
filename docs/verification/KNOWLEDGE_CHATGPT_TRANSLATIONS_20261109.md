# ChatGPTからテーマの訳文を登録・訂正する接続

2026-11-09。実装・隔離検証・localhost／HTTPS β／正式サイトへの反映と、同じ実ChatGPT Appからの訳文登録・公開・正式表示まで完了。以下の準備段階の記載は各時点の履歴。

## 不足と対応

既存の訳文保存・生成・同値性確認・寄与者・Capsule固定は存在したが、ChatGPTのTheme作成／更新MCPには訳文を登録する操作がなかった。通常の `update_theme` に訳文を混ぜると原文とTheme構成版を変更するため、同じApp・`themes:compose` 内の4操作として接続した。Theme／Entity／Record／Sourceの固定原本を読んで、原文とは独立した訳文版を投稿する。新規Theme公開後も同じ会話から続けられる。

読取・登録／訂正・当該受付の状態・取消を提供。既存会員の永続受付、公開文脈の同値性確認、予算、再試行、匿名／名前付き寄与と活動履歴を再利用する。追加migration・新Worker・課金・Kev変更は不要。

## 検証

隔離した一時PostgreSQLの会員／知識DBと、MCP schema・権限境界の合計17件が成功。原文／Themeの版と保存したCapsule保持、既存訳文の訂正と旧訳文の読取、同一ID並行再送・文面変更拒否、応答喪失の続行、状態照会が勝手に処理を始めないこと、取消を復活させないこと、後から編集した草稿を古い再送で提出しないこと、別所有者／公開範囲、profile／anonymous帰属を検証した。AI応答はfixtureで、実Gemini／実ChatGPTの確認とは区別する。

変更対象lint成功。型検査ではテスト側のUUID推論・匿名引数・JSONschemaの型注釈を修正し、β向けbuildで型検査まで成功した。最初の試験で、試験DBを毎回作り直す際のキャッシュ付きfixtureを修正した。また2件目の送信が既存の送信間隔待ちになったため、隔離試験の時刻だけを進めて訂正まで確認した。本体の待ち処理・利用枠は緩めない。

## ローカル容量不足からの復帰

Cの空きが約31MBとなりUbuntuの書込が失敗。ユーザーの空き確保後は約30GiBの空きを確認したが、書込制限が残ったため、既存の許可範囲で12コンテナを正常停止しDocker Desktop／WSLを再起動した。実際の書込を確認し、元の12コンテナとPlunodeのWeb／Worker・正式接続PC収集／読取を復帰。14 private設定のhashとmain SHAを保持。localhost3200／HTTPS βはHTTP200、共有Kevのhealthも200。DB・volume・モデル・ソース・設定は削除／移動せず、正式VPSは未変更。起動直後のNeo4jウォームアップで一度500になり、その後200へ回復した。

資材はRAM領域へ一時展開し、C空きを確認しながら作成する。再起動のため失われたRAM資材は再利用しない。

## 配置と残件

直前のapp 9edea51a、localhost／β build NryL0r9D2f-0_C79h2o9g、正式build N8Bl5w9EhBsWobty5fc7Gを起点とする。会員39／知識9を維持し、Webのみを更新する。最終アプリはbc486903。β向けbuild B4MiXUlaSU-rC5jeP2a1hが成功。新APIのβ確認・正式反映・既存ChatGPT接続での確認はこれから行う。

公開決定が記録された直後（通常Workerが表示状態を追いつかせる前）も、公開済みの訳文として返し、取消で削除したと偽らないことを追加検証した。補修後も17件成功。

正式切替はWebだけ。同じDB形式を読める直前Webへの復帰だけを許容し、旧dump復元やWorker／OS更新は行わない。直前Webのsource／image／build、会員39／知識9の全checksum、private環境設定のhashを照合。稼働Composeは切替直前に固定してbackupし、変更はWeb imageだけとrendered configの全体比較で検証する。

## β反映と本番切替準備

アプリsource `bc48690353b23d6fe9b67a8d859c9d3d08a0eea1`。β build `B4MiXUlaSU-rC5jeP2a1h`、正式候補build `RWsvoeFimf3i8iA3_oAfH`。両方のwebpack build・型検査が成功。正式候補tagは `plunode-web:theme-translations-bc486903`、config image `sha256:4b9a22e401293c9a45fedd3212968449097a6be2c9e53cefbb4e6140cfcfa57b`、manifest image `sha256:e537e4c20280b533a905e8a27f79a5fbbce28f3cb074e87b8220e0e7f685de05`。同じ固定sourceから、正式は既存のproduction用テーマ紹介設定で作成した。秘密値・β DB・実験データはimageへ入れない。

β切替では14 private設定のhash・既存Worker PIDを保持。実DBの全migration checksumを照合し、会員39件／知識8件を維持した（βは草稿用003をこのDBへ置いていない。正式の知識9件と混同しない）。新規migration・DB操作なし。localhostとWindows側HTTPS βがHTTP200。実Googleログイン済みChromeでTOP→Webbテーマ構成版5の年表／関係図・作成導線を確認。新しい投稿の送信やGoogleの再ログインはこの画面確認では行っていない。

同じ稼働設定と既存運営者を用いた読取専用のserver probeで、実DB上のWebbテーマ構成版2の原文・訳文版0と、新guideの翻訳schemaをdispatcher経由で確認。transportのOAuthや実Gemini送信の代わりと扱わない。Node単独でserver-only moduleを読む初回は条件不足で停止し、server条件で実行して成功した。ブラウザのDOM接続がfocus処理でtimeoutしたため、同じChromeの標準AX操作へ切り替え、再起動を要求せず画面確認を完了した。

正式候補のstandalone imageを、private設定／DBを接続しない一時コンテナで起動。robots200、MCPのPOST専用ルートがGET405を返すことを確認。最初の試験でGET404を仮定していた期待値は誤りで、アプリ修正は不要。archive全layer・config・manifestとsource labelを検証し、VPSへの転送後にも全checksumを照合。ここまで本番のWeb／DB／Workerは未変更。

実行用コマンド：`wsl -d Ubuntu -- python3 /home/isinxnisi/1.projects/7.graph-knowledge/backups/theme-translations-20261109/run-release.py`。VPSの既存sudo入力が必要。通常の共通holdを解放して引き渡し、command側がguardを取得・解放する。切替後、既存正式Appの新操作の取得、訳文登録と原文／Theme版の保持、正式表示を続けて確認する。

## 正式切替と同じChatGPT Appでの公開確認（完了）

本人のsudo実行で、正式Webをアプリ `bc48690353b23d6fe9b67a8d859c9d3d08a0eea1`／build `RWsvoeFimf3i8iA3_oAfH`／manifest image `sha256:e537e4c20280b533a905e8a27f79a5fbbce28f3cb074e87b8220e0e7f685de05` へ切替。backupは `/opt/graph-knowledge/backups/theme-translations-web-20261108T172832Z`。会員39／知識9のmigration checksum、Worker・既存設定・KG・AI artifactは不変。DB migration／dump復元／OS更新は行っていない。切替後のactivated記録を読み戻し、正式rootと当該build manifestのHTTP200を確認した。

既存「Plunodeテーマ・資料 API（本番）」の「ツールを更新」を実行し、同じApp・既存接続・同じ「テーマ作成の進め方」会話を継続。Appの再作成、新規OAuth権限、収集計画や運営画面の操作は不要だった。認証済み `get_theme_authoring_guide` で翻訳操作のschemaを取得した。

実ChatGPTから `read_theme_translation` → `submit_theme_translation` → `get_theme_translation_submission` と読戻しを行い、Webbテーマ `theme:915ba2bce69de60302801bf691e77ff06beb6a43cb56c0d1` 構成版6のtitle・enを公開した。受付 `f70c44bb-6268-4c73-a90a-f9d25fe2d75d`、最終状態 `published`。訳文IDは `translation:612f65d2e3875343cbd3c68c811e4a8a99bf1b1b024b7163`、訳文版1、本文は `Webb's Journey to Unfolding in Space`。公開時刻は2026-11-08 17:35:15 UTC（11月9日02:35 JST）。実受付は通常の確認・公開経路を通しており、17件のfixture AI試験とは区別する。今回、同じ英訳を試験のために再登録したり、公開済みの訳文を取り消したりはしていない。

独立に正式公開APIを読んで上記訳文・原文 `Webbが宇宙でひらくまで`・原文hash・対象構成版6を照合。登録前後の認証済み `read_theme` のThemeオブジェクトとsnapshotを全体比較し、日本語原文・Theme構成版・12記録／4対象／7資料・年表配置が一致した。実Chromeでも正式 `/en` の中央見出しが英訳になり、構成版6と右の日本語原文が保たれていることを確認した。利用者が続けて依頼した他項目の英訳は、この1件の確認結果には含めない。

確認先：

- [英語表示のWebbテーマ](https://plunode.net/en?ktheme=theme%3A915ba2bce69de60302801bf691e77ff06beb6a43cb56c0d1&krev=6&kview=split)
- [訳文版1と対応する原文](https://plunode.net/translations?id=translation%3A612f65d2e3875343cbd3c68c811e4a8a99bf1b1b024b7163&revision=1)

既存Chatで「このテーマのタイトルや説明を英訳して登録して」と依頼できる。原文や構成の変更は `update_theme`、訳文は読取後のexpectedRevisionを指定して別操作で登録する。訂正は最新訳文を読んで別requestIdへ進み、旧訳文版は保持する。1操作は1項目・1言語で、既存の会員連投制限（20件／時）・同時草稿上限・共通AI予算を継承する。テーマ丸ごとの一括投稿専用APIや、この確認で全項目を訳し切る処理は追加していない。

本番で実測したのはタイトル1件の新規訳文の公開・読戻し・表示。訳文訂正／取消／匿名／再送障害の代表境界は隔離試験で確認し、本番へ不要な再登録を繰り返していない。スマホの新しい配置変更はなく、今回の正式実画面確認はPC幅。保存済みCapsule／共有断面の保持は既存契約と17件の試験によるもので、今回この本番テーマから別のCapsuleを作って再検証してはいない。

正式切替後の記録だけの追記では再build・再配置しない。localhost3200／HTTPS βはアプリbc486903・build B4MiXUlaSU-rC5jeP2a1h、正式は同アプリ・build RWsvoeFimf3i8iA3_oAfHで、いずれも反映済み。

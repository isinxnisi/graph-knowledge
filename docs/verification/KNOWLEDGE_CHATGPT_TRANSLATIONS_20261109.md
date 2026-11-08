# ChatGPTからテーマの訳文を登録・訂正する接続

2026-11-09。実装・隔離検証を実施、配置と実ChatGPT確認は未完了。

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

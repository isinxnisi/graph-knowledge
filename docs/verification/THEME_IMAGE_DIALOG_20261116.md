# テーマ画像の拡大表示（2026-11-16）

## 変更

テーマ画面の導入画像を押すと、同じ画像の全体をnative dialogで拡大する。サムネイルの配置・寸法・導入文章を保持し、画像そのものや登録情報は変更しない。画像の縦横比を維持し、画面の幅・高さへ収める。

既存の閉じる部品と背景クリック判定を再利用する。閉じるボタン・Esc・背景クリックで閉じ、画像内から外へドラッグした場合は閉じない。native modalのフォーカス制御を使い、閉鎖後は元の画像ボタンへ戻る。テーマ／URL・Graph／年表の状態は変更しない。拡大中だけルートページのスクロールを止め、閉鎖で通常スクロールへ戻す。

画像が読めない場合は既存どおり導入文章だけを表示する。画像を切り替えた場合、前の拡大状態や読み込み失敗を引き継がない。日本語・英語の操作名を用意する。

## 検証

- 画像の開閉・Esc・背景クリック／ドラッグ区別・画像切替／読み込み失敗を3件で検証。既存の読み物表示14件と合わせ17件成功。変更TSXのESLint成功。
- 隔離ディレクトリで稼働Webを維持してwebpack build・型検査を実行。ビルドと配置ソースを照合し、3200のbuildだけを切り替える。DB移行・登録内容・Worker・本番変更なし。
- 1440×900／390×844／1024×768／844×390で画像全体の収まり、閉じる操作、フォーカス復帰とURL保持を確認。初回の実操作で背景wheelによる本文移動を発見し、拡大中だけhtmlをロックする局所CSSを追加。PC／スマホ幅の実ブラウザへCSSを適用して、背景・画像上のwheelによる移動を防げることを確認した。
- 最終ビルドのローカル／HTTPS βでの再確認は下記のとおり完了。iPhone実機は未確認。

## 環境

作業開始後の画面確認で3200のWeb停止を発見した。最初のWeb復帰では`.env.public`だけを読み、知識読取APIが404となったため、既存`start-local-previews.py`のβ設定読込と保存済みconfirmation設定を併用して復帰した。private設定ファイル・DB・Workerの内容は変更していない。

保存画面・検証結果：`C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/theme-image-dialog-20261116/` と `backups/theme-image-dialog-20261116/local/`。変更前のPC画像126×96px、スマホ64×68pxを維持する。

初回のβ確認では本番source29e2d1aa／build kmAn75_BlcSljfRq5IqaCを維持し、画像拡大は未反映とした。その後、ユーザーが本番反映を明示承認。以下の本番工程を追加する。

## 最終反映と確認結果

- 実装e767574c、背景スクロール補修ef193bd1305233f9c840029a690a0a0f755c8c0c。配置ソースを照合し、build `nO3lQgJ3iwNSAQ9Ft6FzE`を3200へ反映。HTTPS βの`buildId`一致を確認した。最終webpack build・型検査成功。
- localhost3200のPC／390pxと、HTTPS βの1440×900／390×844／1024×768／844×390ですべて、画像・dialogが画面内、閉鎖後のフォーカス復帰・URL保持・背景位置保持がtrue。
- 閉じるボタン／Esc／背景クリックと、画像から背景へのドラッグで閉じないことを確認。背景と画像上のwheel、スマホ幅のCDP touchスワイプでも背景のスクロール位置を保持した。ChromeのスマホエミュレーションでありiPhone実機／Safariの確認とは区別する。
- 元の画像ボタン寸法はPC126×96px／390px時64×68px。画像全体はPC約987×740px／390px時332×249px／横向き約307×230px。
- 最終画面／JSONは上記保存先の`final/`、ローカル結果は`backups/theme-image-dialog-20261116/local-final/`。修正前と補修前の結果も保持し、失敗を成功扱いにしていない。
- Webは既存β設定を読み、端末の終了に依存しない独立プロセスとして起動。既存`beta.pid`／`beta.log`へ記録し、3200の継続稼働を確認。新しい自動起動設定やWorker変更は行っていない。
- 互換復帰用の旧buildは`backups/theme-image-dialog-20261116/previous-beta-build/`に保持。戻す場合はWebだけ停止・build交換・同じβ設定で再起動する。DBの巻戻しは不要。
- 初回β反映時点では本番は未反映。テーマ・画像・商品・訳文の登録内容、API、DB migration、Worker・private設定ファイルは変更していない。後続の正式反映でも同じ境界を維持する。

## 本番反映の準備（本人による反映承認後）

工程は①現行と差分確認・②固定image／転送照合と復旧準備・③本番切替と正式画面確認。

- mainの固定source `4675179e34de79b9ea5c24b68962ea869a7913bb`を採用。現在本番source29e2d1aaとの差分のうち実行時の変更はThemeReadingHeroの画像ボタン／dialogと局所CSSのみ。登録内容を含むβデータは移行しない。
- 本番HTTPSのbuildが既存`kmAn75_BlcSljfRq5IqaC`であることと、SSH側の直前切替receiptを確認。本番`sudo -n`は本人パスワードが必要なため、実環境のprivate設定・migration ledger等の厳密な再監査は本人実行の切替プログラムの先頭で行う。
- `scripts/release-theme-image-production.py`は既存のWeb限定手順を再利用。直前29e2d1aaのimage／build、直前backupから導いたCompose全文、設定hash、会員44／知識9 migration checksumを照合する。不一致なら変更前に停止する。
- source label／image config・manifest／全layer・buildを検証して配置する。ComposeはWebのimageだけ変更し、private設定と旧Composeをbackupする。既存の訳文全版を開始時に照合し、切替後に保持を確認。Worker・DB migration・登録操作は行わない。
- 互換復旧は直前Web／Composeのみ。DB dumpの復元や旧形式への巻戻しは行わない。image照合の既存5試験成功、切替プログラムの構文検査成功。

本番資材・切替結果・実画面確認は下記の完了記録へ追記した。準備段階と実反映を区別する。

- 正式候補build `rkyr-DN02OjLWuFjxoU9Y`、image config `sha256:3062c17be2c50d1048ec398362ba58bba7364a534891ea5fbec8ac46ada46ce7`。archive SHA-256 `562038f19e23e7c0f041b0dec5349e8d7120e794bac73ac6957b765ed2531e6f`。archive全layer・source label・起動JS構文・既存AI artifact同一を確認済み。

## 正式Web反映と画面確認完了

- 本人による既存sudo入力でWebのみ切替。source `4675179e34de79b9ea5c24b68962ea869a7913bb`／正式build `rkyr-DN02OjLWuFjxoU9Y`。SSHから切替receiptを回収し、正式HTTPSのbuildId一致を独立確認した。
- 本番containerd manifest `sha256:6fc64f16376a3b52f14551941ae3604d7486e2d203da290aee3ca52a174c4e4f`は、照合済みarchiveのconfig／全layerに一致。会員44／知識9 migration、既存訳文620版、Worker・PG／KG・private設定・AI artifactを保持。DB移行・登録操作なし。
- 正式HTTPSのNasテーマ構成版18とツタンカーメン構成版6を、Windows側の独立Chromeから実読取。両テーマのPC1440×900／スマホ390×844で、画像全体の収まり・×／背景／Esc・画像からのドラッグで閉じないこと・フォーカス復帰・URL保持・背景wheel／touchスワイプ時の位置保持を確認。公開クレジットの折返しも確認。
- 切替前後の正式APIでNas構成版18のTheme全体と固定snapshotの26 Entity／42 Record／6 Sourceが一致。本文・版・画像参照を変更していない。
- 保存画面は上記visualizations内の`production/`／`production-credit/`、実測JSONも同所。最終受入を`backups/theme-image-production-20261116/formal-acceptance.json`へ保存。切替直後receiptの`formalBrowserAcceptancePending:true`と、後続ブラウザ検証完了を区別して記録した。iPhone実機／Safariは未確認。
- backup `/opt/graph-knowledge/backups/theme-image-web-20261116T140807Z`。互換復旧は直前29e2d1aaのWeb／Composeのみとし、DB dumpへ戻さない。
- βは既存build `nO3lQgJ3iwNSAQ9Ft6FzE`の継続応答を確認。今回の追加変更は切替手順・完了文書だけのためβの再buildは不要。全体①現行確認・②資材／照合・③正式切替と画面確認まで完了。
